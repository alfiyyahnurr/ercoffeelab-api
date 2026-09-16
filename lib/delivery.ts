import { sql } from "@/src/db/client";

/**
 * Calculate great-circle distance between two points on the earth surface (in kilometers)
 * using the Haversine formula.
 */
export function calculateDistanceKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const R = 6371; // Earth radius in kilometers
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const distance = R * c;

  return Math.round(distance * 100) / 100; // Round to 2 decimal places
}

export interface DeliveryQuoteResult {
  isDeliverable: boolean;
  distanceKm: number;
  deliveryFee: number;
  maxDistanceKm: number;
  tierId?: number | null;
  outletName?: string;
  message?: string;
}

/**
 * Calculates delivery eligibility and tiered fee for a given outlet and customer coordinates.
 */
export async function getDeliveryQuote(
  outletId: number | string,
  customerLat: number,
  customerLng: number,
): Promise<DeliveryQuoteResult> {
  const outlets = await sql`
    SELECT id, name, latitude, longitude, 
           coalesce(max_delivery_distance_km, 10.00) as max_delivery_distance_km,
           coalesce(is_delivery_enabled, true) as is_delivery_enabled
    FROM outlets
    WHERE id = ${Number(outletId)}
    LIMIT 1
  `;

  const outlet = outlets[0];
  if (!outlet) {
    throw new Error("Outlet tidak ditemukan");
  }

  const maxDistanceKm = Number(outlet.max_delivery_distance_km) || 10;
  const isDeliveryEnabled = Boolean(outlet.is_delivery_enabled);

  if (!isDeliveryEnabled) {
    return {
      isDeliverable: false,
      distanceKm: 0,
      deliveryFee: 0,
      maxDistanceKm,
      outletName: outlet.name,
      message: `Layanan pesan antar (delivery) sedang dinonaktifkan di cabang ${outlet.name}.`,
    };
  }

  const outletLat = Number(outlet.latitude);
  const outletLng = Number(outlet.longitude);

  if (isNaN(outletLat) || isNaN(outletLng)) {
    // If outlet coordinates not set, fallback to default flat delivery fee
    return {
      isDeliverable: true,
      distanceKm: 0,
      deliveryFee: 10000,
      maxDistanceKm,
      outletName: outlet.name,
      message: "Koordinat cabang belum dikonfigurasi, menggunakan tarif flat default.",
    };
  }

  const distanceKm = calculateDistanceKm(
    outletLat,
    outletLng,
    customerLat,
    customerLng,
  );

  // Check if exceeds maximum radius
  if (distanceKm > maxDistanceKm) {
    return {
      isDeliverable: false,
      distanceKm,
      deliveryFee: 0,
      maxDistanceKm,
      outletName: outlet.name,
      message: `Alamat pengiriman di luar jangkauan cabang ${outlet.name} (Jarak Anda: ${distanceKm} km, Maksimal: ${maxDistanceKm} km).`,
    };
  }

  // 1. Check for outlet-specific active delivery tiers
  let tiers = await sql`
    SELECT id, min_distance_km, max_distance_km, fee
    FROM delivery_tiers
    WHERE outlet_id = ${Number(outletId)} AND is_active = true
    ORDER BY min_distance_km ASC
  `;

  // 2. Fallback to global active delivery tiers if no outlet-specific tiers configured
  if (tiers.length === 0) {
    tiers = await sql`
      SELECT id, min_distance_km, max_distance_km, fee
      FROM delivery_tiers
      WHERE outlet_id IS NULL AND is_active = true
      ORDER BY min_distance_km ASC
    `;
  }

  // 3. Find matching tier for current distance
  const matchedTier = tiers.find((t) => {
    const min = Number(t.min_distance_km);
    const max = Number(t.max_distance_km);
    return distanceKm >= min && distanceKm <= max;
  });

  if (matchedTier) {
    return {
      isDeliverable: true,
      distanceKm,
      deliveryFee: Number(matchedTier.fee),
      maxDistanceKm,
      tierId: Number(matchedTier.id),
      outletName: outlet.name,
      message: `Ongkos kirim (${distanceKm} km): Rp ${Number(matchedTier.fee).toLocaleString("id-ID")}`,
    };
  }

  // 4. Default fallback fee if within range but not in defined tiers
  const fallbackFee = 10000;
  return {
    isDeliverable: true,
    distanceKm,
    deliveryFee: fallbackFee,
    maxDistanceKm,
    outletName: outlet.name,
    message: `Ongkos kirim (${distanceKm} km): Rp ${fallbackFee.toLocaleString("id-ID")}`,
  };
}

import { NextResponse } from "next/server";
import { sql } from "@/src/db/client";
import { requireStaff } from "@/lib/auth-middleware";
import { formatOutlet } from "./utils";

/**
 * GET /api/outlets
 * Publik — Mengambil daftar semua outlet
 */
export async function GET() {
  try {
    const rows = await sql`SELECT * FROM outlets ORDER BY name ASC`;
    const data = rows.map(formatOutlet);
    return NextResponse.json({ data });
  } catch (err: any) {
    console.error("GET /api/outlets error:", err);
    return NextResponse.json(
      { error: err?.message || "Gagal memuat data outlet" },
      { status: 500 },
    );
  }
}

/**
 * POST /api/outlets
 * Super Admin only — Menambahkan outlet baru
 */
export async function POST(req: Request) {
  try {
    const auth = await requireStaff(req, ["super_admin"]);
    if ("error" in auth) return auth.error;

    const body = await req.json().catch(() => null);
    const name = body?.name?.trim();
    const address = body?.address?.trim();

    if (!name || !address) {
      return NextResponse.json(
        { error: "name dan address wajib diisi" },
        { status: 400 },
      );
    }

    const phone = body?.phone ? String(body.phone).trim() : null;
    const openHour = body?.openHour ?? null;
    const closeHour = body?.closeHour ?? null;
    const isOpen = body?.isOpen !== undefined ? Boolean(body.isOpen) : true;
    const latitude = body?.latitude !== undefined && body?.latitude !== null ? Number(body.latitude) : null;
    const longitude = body?.longitude !== undefined && body?.longitude !== null ? Number(body.longitude) : null;
    const deliveryFee = body?.deliveryFee !== undefined ? Number(body.deliveryFee) : 10000;
    const maxDeliveryDistanceKm = body?.maxDeliveryDistanceKm !== undefined ? Number(body.maxDeliveryDistanceKm) : 10;
    const isDeliveryEnabled = body?.isDeliveryEnabled !== undefined ? Boolean(body.isDeliveryEnabled) : true;

    const rows = await sql`
      INSERT INTO outlets (
        name, address, phone, open_hour, close_hour, is_open, 
        latitude, longitude, delivery_fee, max_delivery_distance_km, is_delivery_enabled
      )
      VALUES (
        ${name}, ${address}, ${phone}, ${openHour}, ${closeHour}, ${isOpen}, 
        ${latitude}, ${longitude}, ${deliveryFee}, ${maxDeliveryDistanceKm}, ${isDeliveryEnabled}
      )
      RETURNING *
    `;

    const newOutlet = rows[0];

    // Inisialisasi otomatis product_outlets untuk seluruh produk master yang sudah ada
    const productRows = await sql`SELECT id FROM products`;
    for (const prod of productRows) {
      await sql`
        INSERT INTO product_outlets (product_id, outlet_id, is_available, price_override)
        VALUES (${prod.id}, ${newOutlet.id}, true, null)
        ON CONFLICT (product_id, outlet_id) DO NOTHING
      `;
    }

    return NextResponse.json(formatOutlet(newOutlet), { status: 201 });
  } catch (err: any) {
    console.error("POST /api/outlets error:", err);
    return NextResponse.json(
      { error: err?.message || "Gagal menambahkan outlet cabang baru" },
      { status: 500 },
    );
  }
}

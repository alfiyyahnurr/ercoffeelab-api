import { sql } from "../src/db/client";

async function geocodeAddress(addressText: string): Promise<{ latitude: number; longitude: number } | null> {
  try {
    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(addressText)}&limit=1&addressdetails=1`;
    const res = await fetch(url, {
      headers: {
        "User-Agent": "ERCoffeeLab-Backend/1.0 (contact@ercoffeelab.com)",
        "Accept-Language": "id,en",
      },
    });

    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0) {
        return {
          latitude: parseFloat(data[0].lat),
          longitude: parseFloat(data[0].lon),
        };
      }
    }
  } catch (err) {
    console.warn("[backfill] Geocoding error for:", addressText, err);
  }

  // Secondary layer: Photon Komoot
  try {
    const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(addressText)}&limit=1`;
    const res = await fetch(url);
    if (res.ok) {
      const data = await res.json();
      if (data?.features?.length > 0) {
        const [lng, lat] = data.features[0].geometry.coordinates;
        return { latitude: lat, longitude: lng };
      }
    }
  } catch (err) {
    console.warn("[backfill] Photon error for:", addressText, err);
  }

  return null;
}

async function runBackfill() {
  console.log("Checking addresses with NULL coordinates in Neon DB...");
  const nullAddresses = await sql`
    SELECT id, full_address, label
    FROM addresses
    WHERE latitude IS NULL OR longitude IS NULL
  `;

  console.log(`Found ${nullAddresses.length} addresses with missing coordinates.`);

  for (const row of nullAddresses) {
    console.log(`Geocoding ID ${row.id}: ${row.full_address}...`);
    const coords = await geocodeAddress(row.full_address);

    if (coords) {
      console.log(`-> Resolved: lat=${coords.latitude}, lng=${coords.longitude}`);
      await sql`
        UPDATE addresses
        SET latitude = ${coords.latitude}, longitude = ${coords.longitude}
        WHERE id = ${row.id}
      `;
    } else {
      console.log(`-> Could not resolve coordinates, keeping null or fallback.`);
    }

    // Delay 1 second to respect Nominatim usage policy
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  console.log("Backfill completed successfully!");
}

runBackfill().catch(console.error);

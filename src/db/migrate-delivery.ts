import "dotenv/config";
import { sql } from "./client";

async function run() {
  console.log("Applying delivery tier schema migration to Neon database...");

  // 1. Add columns to outlets
  await sql`
    ALTER TABLE "outlets" 
    ADD COLUMN IF NOT EXISTS "delivery_fee" INTEGER DEFAULT 10000 NOT NULL,
    ADD COLUMN IF NOT EXISTS "phone" TEXT,
    ADD COLUMN IF NOT EXISTS "max_delivery_distance_km" NUMERIC(5, 2) DEFAULT 10.00 NOT NULL,
    ADD COLUMN IF NOT EXISTS "is_delivery_enabled" BOOLEAN DEFAULT true NOT NULL;
  `;
  console.log("✅ Outlets columns updated.");

  // 2. Create delivery_tiers table
  await sql`
    CREATE TABLE IF NOT EXISTS "delivery_tiers" (
      "id" BIGSERIAL PRIMARY KEY NOT NULL,
      "outlet_id" BIGINT REFERENCES "outlets"("id") ON DELETE CASCADE,
      "min_distance_km" NUMERIC(5, 2) DEFAULT 0.00 NOT NULL,
      "max_distance_km" NUMERIC(5, 2) NOT NULL,
      "fee" INTEGER NOT NULL,
      "is_active" BOOLEAN DEFAULT true NOT NULL,
      "created_at" TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
    );
  `;
  await sql`CREATE INDEX IF NOT EXISTS "idx_delivery_tiers_outlet_id" ON "delivery_tiers"("outlet_id");`;
  console.log("✅ delivery_tiers table created.");

  // 3. Add columns to orders
  await sql`
    ALTER TABLE "orders"
    ADD COLUMN IF NOT EXISTS "delivery_fee" INTEGER DEFAULT 0 NOT NULL,
    ADD COLUMN IF NOT EXISTS "delivery_distance_km" NUMERIC(5, 2),
    ADD COLUMN IF NOT EXISTS "delivery_latitude" DOUBLE PRECISION,
    ADD COLUMN IF NOT EXISTS "delivery_longitude" DOUBLE PRECISION;
  `;
  console.log("✅ orders columns updated.");

  // 4. Add columns to addresses
  await sql`
    ALTER TABLE "addresses"
    ADD COLUMN IF NOT EXISTS "latitude" DOUBLE PRECISION,
    ADD COLUMN IF NOT EXISTS "longitude" DOUBLE PRECISION,
    ADD COLUMN IF NOT EXISTS "delivery_notes" TEXT;
  `;
  console.log("✅ addresses columns updated.");

  // 5. Seed default delivery tiers if none exist
  const existingTiers = await sql`SELECT id FROM delivery_tiers LIMIT 1`;
  if (existingTiers.length === 0) {
    console.log("Seeding default delivery tiers (0-5 km: 10k, 5-10 km: 15k)...");
    await sql`
      INSERT INTO delivery_tiers (outlet_id, min_distance_km, max_distance_km, fee, is_active)
      VALUES 
        (null, 0.00, 5.00, 10000, true),
        (null, 5.01, 10.00, 15000, true);
    `;
    console.log("✅ Default delivery tiers seeded.");
  }

  console.log("Migration complete!");
}

run().catch((err) => {
  console.error("Migration error:", err);
  process.exit(1);
});

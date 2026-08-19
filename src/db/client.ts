import "dotenv/config";
import { neon } from "@neondatabase/serverless";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL belum diisi di file .env");
}

// Query layer utama pakai raw SQL (poin 21) — supaya gampang dipindah bahasa lain.
// Drizzle HANYA dipakai untuk migration & seed (lihat drizzle.config.ts & seed.ts).
//
// Contoh pemakaian di API route:
//   import { sql } from "@/db/client";
//   const rows = await sql`SELECT * FROM outlets WHERE is_open = true`;
export const sql = neon(process.env.DATABASE_URL);

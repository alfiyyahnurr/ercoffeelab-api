import { NextResponse } from "next/server";
import { sql } from "@/src/db/client";
import { requireStaff } from "@/lib/auth-middleware";
import { formatCustomer } from "./utils";

/**
 * GET /api/customers
 * Staff only — Mengambil daftar pelanggan (dengan pencarian & info loyalty).
 * Query param: ?search= (cari di full_name, email, phone).
 */
export async function GET(req: Request) {
  const auth = await requireStaff(req);
  if ("error" in auth) return auth.error;

  const { searchParams } = new URL(req.url);
  const searchParam = searchParams.get("search")?.trim() || null;
  const searchPattern = searchParam ? `%${searchParam}%` : null;

  const rows = await sql`
    SELECT 
      c.id,
      c.phone,
      c.email,
      c.full_name,
      c.gender,
      c.is_verified,
      c.created_at,
      COALESCE(cl.points, 0) AS points,
      COALESCE(cl.total_orders, 0) AS total_orders,
      lt.id AS tier_id,
      lt.name AS tier_name
    FROM customers c
    LEFT JOIN customer_loyalty cl ON cl.customer_id = c.id
    LEFT JOIN loyalty_tiers lt ON lt.id = cl.tier_id
    WHERE (${searchPattern}::text IS NULL OR 
           c.full_name ILIKE ${searchPattern} OR 
           c.email ILIKE ${searchPattern} OR 
           c.phone ILIKE ${searchPattern})
    ORDER BY c.created_at DESC
  `;

  const data = rows.map(formatCustomer);
  return NextResponse.json({ data });
}

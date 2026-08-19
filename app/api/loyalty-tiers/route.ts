import { NextResponse } from "next/server";
import { sql } from "@/src/db/client";
import { requireStaff } from "@/lib/auth-middleware";
import { formatLoyaltyTier } from "./utils";

/**
 * GET /api/loyalty-tiers
 * Publik — Mengambil daftar jenjang loyalty tiers urut sort_order.
 */
export async function GET() {
  const rows = await sql`SELECT * FROM loyalty_tiers ORDER BY sort_order ASC`;
  const data = rows.map(formatLoyaltyTier);
  return NextResponse.json({ data });
}

/**
 * POST /api/loyalty-tiers
 * Super Admin only — Menambahkan jenjang loyalty tier baru.
 */
export async function POST(req: Request) {
  const auth = await requireStaff(req, ["super_admin"]);
  if ("error" in auth) return auth.error;

  const body = await req.json().catch(() => null);
  const name = body?.name?.trim();
  const minPoints = body?.minPoints;
  const sortOrder = body?.sortOrder;

  if (!name || typeof minPoints !== "number" || typeof sortOrder !== "number") {
    return NextResponse.json(
      { error: "name, minPoints, dan sortOrder wajib diisi dengan benar" },
      { status: 400 },
    );
  }

  const minOrders =
    body.minOrders !== undefined && body.minOrders !== null
      ? Number(body.minOrders)
      : null;
  const benefitNote = body.benefitNote?.trim() || null;

  const insertedRows = await sql`
    INSERT INTO loyalty_tiers (name, min_points, min_orders, benefit_note, sort_order)
    VALUES (${name}, ${minPoints}, ${minOrders}, ${benefitNote}, ${sortOrder})
    RETURNING *
  `;

  return NextResponse.json(formatLoyaltyTier(insertedRows[0]), { status: 201 });
}

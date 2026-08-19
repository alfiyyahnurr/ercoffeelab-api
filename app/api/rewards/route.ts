import { NextResponse } from "next/server";
import { sql } from "@/src/db/client";
import { requireStaff } from "@/lib/auth-middleware";
import { formatReward } from "./utils";

/**
 * GET /api/rewards
 * Publik — Mengambil daftar hadiah penukaran poin.
 */
export async function GET() {
  const rows = await sql`SELECT * FROM rewards ORDER BY point_cost ASC`;
  const data = rows.map(formatReward);
  return NextResponse.json({ data });
}

/**
 * POST /api/rewards
 * Super Admin only — Menambahkan hadiah penukaran poin baru.
 */
export async function POST(req: Request) {
  const auth = await requireStaff(req, ["super_admin"]);
  if ("error" in auth) return auth.error;

  const body = await req.json().catch(() => null);
  const name = body?.name?.trim();
  const pointCost = body?.pointCost;

  if (!name || typeof pointCost !== "number" || isNaN(pointCost) || pointCost <= 0) {
    return NextResponse.json(
      { error: "name dan pointCost wajib diisi dengan angka positif" },
      { status: 400 },
    );
  }

  const description = body.description?.trim() || null;

  const insertedRows = await sql`
    INSERT INTO rewards (name, point_cost, description)
    VALUES (${name}, ${pointCost}, ${description})
    RETURNING *
  `;

  return NextResponse.json(formatReward(insertedRows[0]), { status: 201 });
}

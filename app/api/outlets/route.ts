import { NextResponse } from "next/server";
import { sql } from "@/src/db/client";
import { requireStaff } from "@/lib/auth-middleware";
import { formatOutlet } from "./utils";

/**
 * GET /api/outlets
 * Publik — Mengambil daftar semua outlet
 */
export async function GET() {
  const rows = await sql`SELECT * FROM outlets ORDER BY name ASC`;
  const data = rows.map(formatOutlet);
  return NextResponse.json({ data });
}

/**
 * POST /api/outlets
 * Super Admin only — Menambahkan outlet baru
 */
export async function POST(req: Request) {
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

  const openHour = body.openHour ?? null;
  const closeHour = body.closeHour ?? null;
  const isOpen = body.isOpen !== undefined ? Boolean(body.isOpen) : true;
  const latitude = body.latitude !== undefined && body.latitude !== null ? Number(body.latitude) : null;
  const longitude = body.longitude !== undefined && body.longitude !== null ? Number(body.longitude) : null;

  const rows = await sql`
    INSERT INTO outlets (name, address, open_hour, close_hour, is_open, latitude, longitude)
    VALUES (${name}, ${address}, ${openHour}, ${closeHour}, ${isOpen}, ${latitude}, ${longitude})
    RETURNING *
  `;

  return NextResponse.json(formatOutlet(rows[0]), { status: 201 });
}

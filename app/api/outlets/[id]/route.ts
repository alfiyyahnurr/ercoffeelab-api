import { NextResponse } from "next/server";
import { sql } from "@/src/db/client";
import { requireStaff } from "@/lib/auth-middleware";
import { formatOutlet } from "../utils";

/**
 * PATCH /api/outlets/:id
 * Super Admin only — Update data outlet
 */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const auth = await requireStaff(req, ["super_admin"]);
  if ("error" in auth) return auth.error;

  const existingRows = await sql`SELECT * FROM outlets WHERE id = ${id}`;
  const existing = existingRows[0];

  if (!existing) {
    return NextResponse.json({ error: "Outlet tidak ditemukan" }, { status: 404 });
  }

  const body = await req.json().catch(() => null);
  if (!body || Object.keys(body).length === 0) {
    return NextResponse.json({ error: "Data update tidak boleh kosong" }, { status: 400 });
  }

  const name = body.name !== undefined ? body.name.trim() : existing.name;
  const address = body.address !== undefined ? body.address.trim() : existing.address;
  const openHour = body.openHour !== undefined ? body.openHour : existing.open_hour;
  const closeHour = body.closeHour !== undefined ? body.closeHour : existing.close_hour;
  const isOpen = body.isOpen !== undefined ? Boolean(body.isOpen) : existing.is_open;
  const latitude =
    body.latitude !== undefined
      ? body.latitude === null
        ? null
        : Number(body.latitude)
      : existing.latitude;
  const longitude =
    body.longitude !== undefined
      ? body.longitude === null
        ? null
        : Number(body.longitude)
      : existing.longitude;

  if (!name || !address) {
    return NextResponse.json(
      { error: "name dan address tidak boleh kosong" },
      { status: 400 },
    );
  }

  const updatedRows = await sql`
    UPDATE outlets
    SET 
      name = ${name},
      address = ${address},
      open_hour = ${openHour},
      close_hour = ${closeHour},
      is_open = ${isOpen},
      latitude = ${latitude},
      longitude = ${longitude}
    WHERE id = ${id}
    RETURNING *
  `;

  return NextResponse.json(formatOutlet(updatedRows[0]));
}

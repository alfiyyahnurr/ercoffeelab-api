import { NextResponse } from "next/server";
import { sql } from "@/src/db/client";
import { requireStaff } from "@/lib/auth-middleware";
import { formatReward } from "../utils";

/**
 * PATCH /api/rewards/:id
 * Super Admin only — Update data reward item
 */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const targetId = Number(id);
  if (isNaN(targetId)) {
    return NextResponse.json({ error: "ID reward tidak valid" }, { status: 400 });
  }

  const auth = await requireStaff(req, ["super_admin"]);
  if ("error" in auth) return auth.error;

  const existingRows = await sql`SELECT * FROM rewards WHERE id = ${targetId}`;
  const existing = existingRows[0];

  if (!existing) {
    return NextResponse.json({ error: "Reward item tidak ditemukan" }, { status: 404 });
  }

  const body = await req.json().catch(() => null);
  if (!body || Object.keys(body).length === 0) {
    return NextResponse.json({ error: "Data update tidak boleh kosong" }, { status: 400 });
  }

  const name = body.name !== undefined ? String(body.name).trim() : existing.name;
  const pointCost =
    body.pointCost !== undefined ? Number(body.pointCost) : Number(existing.point_cost);
  const description =
    body.description !== undefined
      ? body.description === null
        ? null
        : String(body.description).trim()
      : existing.description;

  if (!name || isNaN(pointCost) || pointCost <= 0) {
    return NextResponse.json(
      { error: "Nama reward dan pointCost wajib diisi angka positif" },
      { status: 400 }
    );
  }

  const updatedRows = await sql`
    UPDATE rewards
    SET
      name = ${name},
      point_cost = ${pointCost},
      description = ${description}
    WHERE id = ${targetId}
    RETURNING *
  `;

  return NextResponse.json(formatReward(updatedRows[0]));
}

/**
 * DELETE /api/rewards/:id
 * Super Admin only — Hapus reward item
 */
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const targetId = Number(id);
  if (isNaN(targetId)) {
    return NextResponse.json({ error: "ID reward tidak valid" }, { status: 400 });
  }

  const auth = await requireStaff(req, ["super_admin"]);
  if ("error" in auth) return auth.error;

  const existingRows = await sql`SELECT id FROM rewards WHERE id = ${targetId}`;
  if (!existingRows[0]) {
    return NextResponse.json({ error: "Reward item tidak ditemukan" }, { status: 404 });
  }

  await sql`DELETE FROM rewards WHERE id = ${targetId}`;

  return NextResponse.json({ message: "Reward item berhasil dihapus" });
}

import { NextResponse } from "next/server";
import { sql } from "@/src/db/client";
import { requireStaff } from "@/lib/auth-middleware";
import { formatCategory } from "../utils";


/**
 * PATCH /api/categories/:id
 * Super Admin only — Update data kategori
 */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const targetId = Number(id);
  if (isNaN(targetId)) {
    return NextResponse.json({ error: "ID kategori tidak valid" }, { status: 400 });
  }

  const auth = await requireStaff(req, ["super_admin"]);
  if ("error" in auth) return auth.error;

  const existingRows = await sql`SELECT * FROM categories WHERE id = ${targetId}`;
  const existing = existingRows[0];

  if (!existing) {
    return NextResponse.json({ error: "Kategori tidak ditemukan" }, { status: 404 });
  }

  const body = await req.json().catch(() => null);
  if (!body || Object.keys(body).length === 0) {
    return NextResponse.json({ error: "Data update tidak boleh kosong" }, { status: 400 });
  }

  const name = body.name !== undefined ? String(body.name).trim() : existing.name;
  const groupName =
    body.groupName !== undefined
      ? String(body.groupName).trim().toLowerCase()
      : existing.group_name;

  if (!name) {
    return NextResponse.json({ error: "Nama kategori wajib diisi" }, { status: 400 });
  }

  if (!["beverage", "food"].includes(groupName)) {
    return NextResponse.json(
      { error: "groupName wajib 'beverage' atau 'food'" },
      { status: 400 }
    );
  }

  const updatedRows = await sql`
    UPDATE categories
    SET
      name = ${name},
      group_name = ${groupName}
    WHERE id = ${targetId}
    RETURNING *
  `;

  return NextResponse.json(formatCategory(updatedRows[0]));
}

/**
 * DELETE /api/categories/:id
 * Super Admin only — Hapus kategori
 */
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const targetId = Number(id);
  if (isNaN(targetId)) {
    return NextResponse.json({ error: "ID kategori tidak valid" }, { status: 400 });
  }

  const auth = await requireStaff(req, ["super_admin"]);
  if ("error" in auth) return auth.error;

  const existingRows = await sql`SELECT id FROM categories WHERE id = ${targetId}`;
  if (!existingRows[0]) {
    return NextResponse.json({ error: "Kategori tidak ditemukan" }, { status: 404 });
  }

  // Set category_id = null for products in this category before deleting
  await sql`UPDATE products SET category_id = NULL WHERE category_id = ${targetId}`;
  await sql`DELETE FROM categories WHERE id = ${targetId}`;

  return NextResponse.json({ message: "Kategori berhasil dihapus" });
}

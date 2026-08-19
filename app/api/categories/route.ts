import { NextResponse } from "next/server";
import { sql } from "@/src/db/client";
import { requireStaff } from "@/lib/auth-middleware";
import { formatCategory } from "./utils";


/**
 * GET /api/categories
 * Publik — Mengambil daftar kategori menu
 */
export async function GET() {
  const rows = await sql`SELECT * FROM categories ORDER BY name ASC`;
  const data = rows.map(formatCategory);
  return NextResponse.json({ data });
}

/**
 * POST /api/categories
 * Super Admin only — Menambahkan kategori menu baru
 */
export async function POST(req: Request) {
  const auth = await requireStaff(req, ["super_admin"]);
  if ("error" in auth) return auth.error;

  const body = await req.json().catch(() => null);
  const name = body?.name?.trim();
  const groupName = body?.groupName?.trim()?.toLowerCase() || "beverage";

  if (!name) {
    return NextResponse.json({ error: "Nama kategori wajib diisi" }, { status: 400 });
  }

  if (!["beverage", "food"].includes(groupName)) {
    return NextResponse.json(
      { error: "groupName wajib 'beverage' atau 'food'" },
      { status: 400 }
    );
  }

  // Cek duplikasi
  const dupCheck = await sql`
    SELECT id FROM categories WHERE LOWER(name) = ${name.toLowerCase()}
  `;
  if (dupCheck[0]) {
    return NextResponse.json(
      { error: `Kategori "${name}" sudah ada` },
      { status: 409 }
    );
  }

  const insertedRows = await sql`
    INSERT INTO categories (name, group_name)
    VALUES (${name}, ${groupName})
    RETURNING *
  `;

  return NextResponse.json(formatCategory(insertedRows[0]), { status: 201 });
}

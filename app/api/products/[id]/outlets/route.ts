import { NextResponse } from "next/server";
import { sql } from "@/src/db/client";
import { requireStaff } from "@/lib/auth-middleware";
import { formatProductOutlet } from "../../utils";

/**
 * PATCH /api/products/:id/outlets
 * Staff only (super_admin atau outlet_admin) —
 * Toggle isAvailable + priceOverride produk per outlet (UPSERT).
 */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const auth = await requireStaff(req);
  if ("error" in auth) return auth.error;

  const body = await req.json().catch(() => null);
  const outletId = Number(body?.outletId);
  const isAvailable = body?.isAvailable !== undefined ? Boolean(body.isAvailable) : undefined;
  const priceOverride =
    body?.priceOverride !== undefined && body?.priceOverride !== null
      ? Number(body.priceOverride)
      : null;

  if (!outletId) {
    return NextResponse.json({ error: "outletId wajib diisi" }, { status: 400 });
  }

  if (isAvailable === undefined) {
    return NextResponse.json({ error: "isAvailable wajib diisi" }, { status: 400 });
  }

  if (priceOverride !== null && (isNaN(priceOverride) || priceOverride < 0)) {
    return NextResponse.json(
      { error: "priceOverride harus angka non-negatif atau null" },
      { status: 400 },
    );
  }

  // Scoped check HANYA untuk outlet_admin. super_admin SELALU diizinkan untuk semua outlet.
  if (auth.payload.role === "outlet_admin") {
    const userOutletId = Number(auth.payload.outletId);
    if (!userOutletId || userOutletId !== outletId) {
      return NextResponse.json(
        { error: "Tidak mempunyai akses ke outlet ini" },
        { status: 403 }
      );
    }
  }

  // Cek keberadaan produk
  const productRows = await sql`SELECT id FROM products WHERE id = ${id}`;
  if (!productRows[0]) {
    return NextResponse.json({ error: "Produk tidak ditemukan" }, { status: 404 });
  }

  // Cek keberadaan outlet
  const outletRows = await sql`SELECT id FROM outlets WHERE id = ${outletId}`;
  if (!outletRows[0]) {
    return NextResponse.json({ error: "Outlet tidak ditemukan" }, { status: 404 });
  }

  // UPSERT
  const rows = await sql`
    INSERT INTO product_outlets (product_id, outlet_id, is_available, price_override)
    VALUES (${id}, ${outletId}, ${isAvailable}, ${priceOverride})
    ON CONFLICT (product_id, outlet_id)
    DO UPDATE SET
      is_available = EXCLUDED.is_available,
      price_override = EXCLUDED.price_override
    RETURNING *
  `;

  return NextResponse.json(formatProductOutlet(rows[0]));
}

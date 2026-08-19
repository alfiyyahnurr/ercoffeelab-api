import { NextResponse } from "next/server";
import { sql } from "@/src/db/client";
import { requireStaff } from "@/lib/auth-middleware";

/**
 * PATCH /api/outlets/:id/menu/:productId
 * Staff only — Update isAvailable dan priceOverride produk untuk outlet ini.
 */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string; productId: string }> }
) {
  const { id: outletIdStr, productId } = await params;
  const outletId = Number(outletIdStr);

  const auth = await requireStaff(req);
  if ("error" in auth) return auth.error;

  const body = await req.json().catch(() => null);
  const isAvailable = body?.isAvailable !== undefined ? Boolean(body.isAvailable) : undefined;
  const priceOverride =
    body?.priceOverride !== undefined && body?.priceOverride !== null
      ? Number(body.priceOverride)
      : null;

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

  // Fetch current state if not passed
  let currentAvailable = true;
  let currentOverride: number | null = null;

  const existing = await sql`
    SELECT is_available, price_override FROM product_outlets
    WHERE product_id = ${productId} AND outlet_id = ${outletId}
  `;

  if (existing[0]) {
    currentAvailable = Boolean(existing[0].is_available);
    currentOverride = existing[0].price_override !== null ? Number(existing[0].price_override) : null;
  }

  const finalAvailable = isAvailable !== undefined ? isAvailable : currentAvailable;
  const finalPriceOverride = priceOverride !== undefined ? priceOverride : currentOverride;

  const rows = await sql`
    INSERT INTO product_outlets (product_id, outlet_id, is_available, price_override)
    VALUES (${productId}, ${outletId}, ${finalAvailable}, ${finalPriceOverride})
    ON CONFLICT (product_id, outlet_id)
    DO UPDATE SET
      is_available = EXCLUDED.is_available,
      price_override = EXCLUDED.price_override
    RETURNING *
  `;

  return NextResponse.json({
    productId,
    outletId,
    isAvailable: Boolean(rows[0].is_available),
    priceOverride: rows[0].price_override !== null ? Number(rows[0].price_override) : null,
  });
}

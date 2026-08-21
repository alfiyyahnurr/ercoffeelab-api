import { NextResponse } from "next/server";
import { sql } from "@/src/db/client";
import { requireCustomer } from "@/lib/auth-middleware";
import { formatProduct } from "../products/utils";

/**
 * GET /api/favorites
 * Header: Authorization: Bearer <customer_token>
 * Mengambil daftar produk favorit milik customer yang sedang login.
 */
export async function GET(req: Request) {
  const auth = await requireCustomer(req);
  if ("error" in auth) return auth.error;

  const customerId = auth.payload.sub;

  const favRows = await sql`
    SELECT 
      f.id AS fav_id,
      f.product_id,
      p.*,
      c.name AS category_name,
      c.group_name AS category_group_name
    FROM favorites f
    JOIN products p ON p.id = f.product_id
    LEFT JOIN categories c ON c.id = p.category_id
    WHERE f.customer_id = ${customerId}
    ORDER BY f.created_at DESC
  `;

  const productIds = favRows.map((r: any) => r.product_id);
  let addonMap: Record<number, any[]> = {};

  if (productIds.length > 0) {
    const addons = await sql`
      SELECT id, product_id, name, extra_price, is_popular
      FROM product_addons
      WHERE product_id = ANY(${productIds})
      ORDER BY name ASC
    `;
    addons.forEach((a: any) => {
      if (!addonMap[a.product_id]) addonMap[a.product_id] = [];
      addonMap[a.product_id].push(a);
    });
  }

  const data = favRows.map((r: any) => ({
    favId: r.fav_id,
    productId: r.product_id,
    product: formatProduct(r, addonMap[r.product_id] || []),
  }));

  return NextResponse.json({ data, productIds });
}

/**
 * POST /api/favorites
 * Header: Authorization: Bearer <customer_token>
 * Body: { productId: number }
 * Menambahkan produk ke daftar favorit customer.
 */
export async function POST(req: Request) {
  const auth = await requireCustomer(req);
  if ("error" in auth) return auth.error;

  const customerId = auth.payload.sub;
  const body = await req.json().catch(() => null);
  const productId = Number(body?.productId || body?.product_id);

  if (!productId || isNaN(productId)) {
    return NextResponse.json({ error: "productId wajib berupa angka valid" }, { status: 400 });
  }

  // Cek produk eksis
  const prod = await sql`SELECT id FROM products WHERE id = ${productId} LIMIT 1`;
  if (!prod[0]) {
    return NextResponse.json({ error: "Produk tidak ditemukan" }, { status: 404 });
  }

  // Insert ignore jika sudah favorit
  const existing = await sql`
    SELECT id FROM favorites WHERE customer_id = ${customerId} AND product_id = ${productId} LIMIT 1
  `;

  if (existing[0]) {
    return NextResponse.json({ message: "Produk sudah ada di favorit", favId: existing[0].id });
  }

  const inserted = await sql`
    INSERT INTO favorites (customer_id, product_id)
    VALUES (${customerId}, ${productId})
    RETURNING id
  `;

  return NextResponse.json({ message: "Berhasil menambahkan ke favorit", favId: inserted[0].id }, { status: 201 });
}

/**
 * DELETE /api/favorites
 * Header: Authorization: Bearer <customer_token>
 * Body: { productId: number } atau URL Query ?productId=1
 * Menghapus produk dari daftar favorit customer.
 */
export async function DELETE(req: Request) {
  const auth = await requireCustomer(req);
  if ("error" in auth) return auth.error;

  const customerId = auth.payload.sub;
  const { searchParams } = new URL(req.url);
  const body = await req.json().catch(() => null);

  const productId = Number(body?.productId || searchParams.get("productId"));
  if (!productId || isNaN(productId)) {
    return NextResponse.json({ error: "productId wajib berupa angka valid" }, { status: 400 });
  }

  await sql`
    DELETE FROM favorites 
    WHERE customer_id = ${customerId} AND product_id = ${productId}
  `;

  return NextResponse.json({ message: "Berhasil menghapus dari favorit" });
}

import { NextResponse } from "next/server";
import { sql } from "@/src/db/client";

/**
 * GET /api/outlets/:id/menu
 * Mengambil daftar menu untuk outlet tertentu.
 * Jika ?all=true dipasang (untuk Admin Panel /menu page), mengambil SEMUA produk master
 * beserta status `isAvailable` dan `priceOverride` cabang tersebut.
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const { searchParams } = new URL(req.url);
  const includeAll = searchParams.get("all") === "true";

  const outletRows = await sql`SELECT id FROM outlets WHERE id = ${id}`;
  if (!outletRows[0]) {
    return NextResponse.json({ error: "Outlet tidak ditemukan" }, { status: 404 });
  }

  const menuRows = includeAll
    ? await sql`
        SELECT 
          p.id,
          p.category_id,
          c.name AS category_name,
          c.group_name AS category_group_name,
          p.name,
          p.type,
          p.base_price,
          COALESCE(po.price_override, p.base_price) AS price,
          po.price_override,
          p.description,
          p.rating,
          p.rating_count,
          p.is_bestseller,
          p.is_new,
          p.image_url,
          COALESCE(po.is_available, true) AS is_available,
          po.stock_note
        FROM products p
        LEFT JOIN product_outlets po ON po.product_id = p.id AND po.outlet_id = ${id}
        LEFT JOIN categories c ON c.id = p.category_id
        ORDER BY c.name ASC, p.name ASC
      `
    : await sql`
        SELECT 
          p.id,
          p.category_id,
          c.name AS category_name,
          c.group_name AS category_group_name,
          p.name,
          p.type,
          p.base_price,
          COALESCE(po.price_override, p.base_price) AS price,
          po.price_override,
          p.description,
          p.rating,
          p.rating_count,
          p.is_bestseller,
          p.is_new,
          p.image_url,
          po.is_available,
          po.stock_note
        FROM products p
        JOIN product_outlets po ON po.product_id = p.id
        LEFT JOIN categories c ON c.id = p.category_id
        WHERE po.outlet_id = ${id} AND po.is_available = true
        ORDER BY c.name ASC, p.name ASC
      `;

  const addonsRows = await sql`
    SELECT id, product_id, name, extra_price, is_popular
    FROM product_addons
    ORDER BY name ASC
  `;

  const addonsByProduct = new Map<string, any[]>();
  for (const addon of addonsRows) {
    const list = addonsByProduct.get(addon.product_id) || [];
    list.push({
      id: addon.id,
      name: addon.name,
      extraPrice: Number(addon.extra_price),
      isPopular: Boolean(addon.is_popular),
    });
    addonsByProduct.set(addon.product_id, list);
  }

  const data = menuRows.map((row) => ({
    id: row.id,
    name: row.name,
    description: row.description ?? null,
    basePrice: Number(row.base_price),
    price: Number(row.price),
    priceOverride: row.price_override !== null && row.price_override !== undefined ? Number(row.price_override) : null,
    category: row.category_name ?? null,
    categoryId: row.category_id,
    categoryName: row.category_name ?? null,
    categoryGroup: row.category_group_name ?? null,
    type: row.type,
    rating: row.rating !== null && row.rating !== undefined ? Number(row.rating) : 0,
    ratingCount: row.rating_count !== null && row.rating_count !== undefined ? Number(row.rating_count) : 0,
    isBestseller: Boolean(row.is_bestseller),
    isNew: Boolean(row.is_new),
    imageUrl: row.image_url ?? null,
    isAvailable: Boolean(row.is_available),
    stockNote: row.stock_note ?? null,
    addons: addonsByProduct.get(row.id) || [],
  }));


  return NextResponse.json({ data });
}

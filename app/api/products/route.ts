import { NextResponse } from "next/server";
import { sql } from "@/src/db/client";
import { requireStaff } from "@/lib/auth-middleware";
import { formatProduct } from "./utils";

/**
 * GET /api/products
 * Publik — Mengambil semua produk master beserta info kategori & addons,
 * TANPA ketersediaan per-outlet (itu urusan GET /api/outlets/:id/menu).
 */
export async function GET() {
  const productRows = await sql`
    SELECT 
      p.id,
      p.category_id,
      c.name AS category_name,
      c.group_name AS category_group_name,
      p.name,
      p.type,
      p.base_price,
      p.description,
      p.rating,
      p.rating_count,
      p.is_bestseller,
      p.is_new,
      p.image_url,
      p.created_at
    FROM products p
    LEFT JOIN categories c ON c.id = p.category_id
    ORDER BY c.name ASC, p.name ASC
  `;

  const addonRows = await sql`
    SELECT id, product_id, name, extra_price, is_popular
    FROM product_addons
    ORDER BY name ASC
  `;

  const addonsByProduct = new Map<string, any[]>();
  for (const addon of addonRows) {
    const list = addonsByProduct.get(addon.product_id) || [];
    list.push(addon);
    addonsByProduct.set(addon.product_id, list);
  }

  const data = productRows.map((row) =>
    formatProduct(row, addonsByProduct.get(row.id) || []),
  );

  return NextResponse.json({ data });
}

/**
 * POST /api/products
 * Super Admin only — Menambahkan produk master baru & optional addons.
 * Otomatis menginisialisasi entri product_outlets untuk seluruh outlet cabang dengan harga default (base_price).
 */
export async function POST(req: Request) {
  const auth = await requireStaff(req, ["super_admin"]);
  if ("error" in auth) return auth.error;

  const body = await req.json().catch(() => null);
  const name = body?.name?.trim();
  const type = body?.type;
  const basePrice = body?.basePrice;

  if (!name) {
    return NextResponse.json({ error: "name wajib diisi" }, { status: 400 });
  }

  if (!type || !["beverage", "food"].includes(type)) {
    return NextResponse.json(
      { error: "type wajib diisi dengan 'beverage' atau 'food'" },
      { status: 400 },
    );
  }

  if (typeof basePrice !== "number" || isNaN(basePrice) || basePrice <= 0) {
    return NextResponse.json(
      { error: "basePrice wajib diisi dengan angka positif" },
      { status: 400 },
    );
  }

  const categoryId = body.categoryId ?? null;
  const description = body.description?.trim() ?? null;
  const isBestseller = Boolean(body.isBestseller);
  const isNew = Boolean(body.isNew);
  const imageUrl = body.imageUrl?.trim() || body.image_url?.trim() || null;

  if (categoryId) {
    const catCheck = await sql`SELECT id FROM categories WHERE id = ${categoryId}`;
    if (!catCheck[0]) {
      return NextResponse.json(
        { error: "Kategori tidak ditemukan" },
        { status: 400 },
      );
    }
  }

  const insertedProducts = await sql`
    INSERT INTO products (category_id, name, type, base_price, description, is_bestseller, is_new, image_url)
    VALUES (${categoryId}, ${name}, ${type}, ${basePrice}, ${description}, ${isBestseller}, ${isNew}, ${imageUrl})
    RETURNING *
  `;


  const newProduct = insertedProducts[0];

  // Inisialisasi otomatis product_outlets untuk setiap outlet agar harga tidak kosong
  const outletRows = await sql`SELECT id FROM outlets`;
  for (const outlet of outletRows) {
    await sql`
      INSERT INTO product_outlets (product_id, outlet_id, is_available, price_override)
      VALUES (${newProduct.id}, ${outlet.id}, true, null)
      ON CONFLICT (product_id, outlet_id) DO NOTHING
    `;
  }

  const insertedAddons: any[] = [];

  if (Array.isArray(body.addons) && body.addons.length > 0) {
    for (const addon of body.addons) {
      if (addon.name && typeof addon.name === "string" && addon.name.trim()) {
        const extraPrice = typeof addon.extraPrice === "number" && addon.extraPrice >= 0 ? addon.extraPrice : 0;
        const isPopular = Boolean(addon.isPopular);

        const rows = await sql`
          INSERT INTO product_addons (product_id, name, extra_price, is_popular)
          VALUES (${newProduct.id}, ${addon.name.trim()}, ${extraPrice}, ${isPopular})
          RETURNING *
        `;
        insertedAddons.push(rows[0]);
      }
    }
  }

  // Fetch category info if joined
  let categoryName: string | null = null;
  let categoryGroup: string | null = null;
  if (categoryId) {
    const catRows = await sql`SELECT name, group_name FROM categories WHERE id = ${categoryId}`;
    if (catRows[0]) {
      categoryName = catRows[0].name;
      categoryGroup = catRows[0].group_name;
    }
  }

  const resultRow = {
    ...newProduct,
    category_name: categoryName,
    category_group_name: categoryGroup,
  };

  return NextResponse.json(formatProduct(resultRow, insertedAddons), { status: 201 });
}

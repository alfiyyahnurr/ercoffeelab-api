import { NextResponse } from "next/server";
import { sql } from "@/src/db/client";
import { requireStaff } from "@/lib/auth-middleware";
import { formatProduct } from "../utils";

/**
 * GET /api/products/:id
 * Publik / Customer / Staff — Ambil detail 1 produk beserta kategorinya dan daftar addon.
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const productIdNum = Number(id);
  if (isNaN(productIdNum)) {
    return NextResponse.json({ error: "ID produk tidak valid" }, { status: 400 });
  }

  const rows = await sql`
    SELECT 
      p.*,
      c.name AS category_name,
      c.group_name AS category_group_name
    FROM products p
    LEFT JOIN categories c ON c.id = p.category_id
    WHERE p.id = ${productIdNum}
    LIMIT 1
  `;
  const product = rows[0];

  if (!product) {
    return NextResponse.json({ error: "Produk tidak ditemukan" }, { status: 404 });
  }

  const addonRows = await sql`
    SELECT id, product_id, name, extra_price, is_popular
    FROM product_addons
    WHERE product_id = ${productIdNum}
    ORDER BY name ASC
  `;

  return NextResponse.json(formatProduct(product, addonRows));
}

/**
 * PATCH /api/products/:id
 * Super Admin only — Update data produk master & addonsnya.
 */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const auth = await requireStaff(req, ["super_admin"]);
  if ("error" in auth) return auth.error;

  const existingRows = await sql`SELECT * FROM products WHERE id = ${id}`;
  const existing = existingRows[0];

  if (!existing) {
    return NextResponse.json({ error: "Produk tidak ditemukan" }, { status: 404 });
  }

  const body = await req.json().catch(() => null);
  if (!body || Object.keys(body).length === 0) {
    return NextResponse.json({ error: "Data update tidak boleh kosong" }, { status: 400 });
  }

  let name = existing.name;
  if (body.name !== undefined) {
    name = typeof body.name === "string" ? body.name.trim() : "";
    if (!name) {
      return NextResponse.json({ error: "name tidak boleh kosong" }, { status: 400 });
    }
  }

  let type = existing.type;
  if (body.type !== undefined) {
    type = body.type;
    if (!["beverage", "food"].includes(type)) {
      return NextResponse.json(
        { error: "type wajib 'beverage' atau 'food'" },
        { status: 400 },
      );
    }
  }

  let basePrice = Number(existing.base_price);
  if (body.basePrice !== undefined) {
    basePrice = body.basePrice;
    if (typeof basePrice !== "number" || isNaN(basePrice) || basePrice <= 0) {
      return NextResponse.json(
        { error: "basePrice wajib angka positif" },
        { status: 400 },
      );
    }
  }

  let categoryId = existing.category_id;
  if (body.categoryId !== undefined) {
    categoryId = body.categoryId ?? null;
    if (categoryId) {
      const catCheck = await sql`SELECT id FROM categories WHERE id = ${categoryId}`;
      if (!catCheck[0]) {
        return NextResponse.json(
          { error: "Kategori tidak ditemukan" },
          { status: 400 },
        );
      }
    }
  }

  const description =
    body.description !== undefined
      ? body.description === null
        ? null
        : String(body.description).trim()
      : existing.description;

  const isBestseller =
    body.isBestseller !== undefined
      ? Boolean(body.isBestseller)
      : Boolean(existing.is_bestseller);

  const isNew =
    body.isNew !== undefined ? Boolean(body.isNew) : Boolean(existing.is_new);

  const imageUrl =
    body.imageUrl !== undefined
      ? body.imageUrl === null
        ? null
        : String(body.imageUrl).trim()
      : body.image_url !== undefined
      ? body.image_url === null
        ? null
        : String(body.image_url).trim()
      : existing.image_url;

  const updatedRows = await sql`
    UPDATE products
    SET
      category_id = ${categoryId},
      name = ${name},
      type = ${type},
      base_price = ${basePrice},
      description = ${description},
      is_bestseller = ${isBestseller},
      is_new = ${isNew},
      image_url = ${imageUrl}
    WHERE id = ${id}
    RETURNING *
  `;

  const updatedProduct = updatedRows[0];

  // Update product_addons if body.addons is provided
  if (Array.isArray(body.addons)) {
    // Re-sync addons: delete old addons for this product and insert new ones
    await sql`DELETE FROM product_addons WHERE product_id = ${id}`;

    for (const addon of body.addons) {
      if (addon.name && typeof addon.name === "string" && addon.name.trim()) {
        const extraPrice =
          typeof addon.extraPrice === "number" && addon.extraPrice >= 0
            ? addon.extraPrice
            : typeof addon.extra_price === "number" && addon.extra_price >= 0
            ? addon.extra_price
            : 0;
        const isPopular = Boolean(addon.isPopular || addon.is_popular);

        await sql`
          INSERT INTO product_addons (product_id, name, extra_price, is_popular)
          VALUES (${id}, ${addon.name.trim()}, ${extraPrice}, ${isPopular})
        `;
      }
    }
  }

  let categoryName: string | null = null;
  let categoryGroup: string | null = null;
  if (updatedProduct.category_id) {
    const catRows = await sql`SELECT name, group_name FROM categories WHERE id = ${updatedProduct.category_id}`;
    if (catRows[0]) {
      categoryName = catRows[0].name;
      categoryGroup = catRows[0].group_name;
    }
  }

  const addonRows = await sql`
    SELECT id, product_id, name, extra_price, is_popular
    FROM product_addons
    WHERE product_id = ${id}
    ORDER BY name ASC
  `;

  const resultRow = {
    ...updatedProduct,
    category_name: categoryName,
    category_group_name: categoryGroup,
  };

  return NextResponse.json(formatProduct(resultRow, addonRows));
}

/**
 * DELETE /api/products/:id
 * Super Admin only — Hapus produk master (cascade hapus product_outlets & product_addons)
 */
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const auth = await requireStaff(req, ["super_admin"]);
  if ("error" in auth) return auth.error;

  const existingRows = await sql`SELECT id FROM products WHERE id = ${id}`;
  if (!existingRows[0]) {
    return NextResponse.json({ error: "Produk tidak ditemukan" }, { status: 404 });
  }

  await sql`DELETE FROM products WHERE id = ${id}`;

  return NextResponse.json({ message: "Produk berhasil dihapus" });
}

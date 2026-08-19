import { NextResponse } from "next/server";
import { sql } from "@/src/db/client";
import { requireStaff } from "@/lib/auth-middleware";
import { formatVoucher } from "../utils";

/**
 * PATCH /api/vouchers/:id
 * Super Admin only — Update data voucher master (termasuk toggle isActive).
 */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const auth = await requireStaff(req, ["super_admin"]);
  if ("error" in auth) return auth.error;

  const existingRows = await sql`SELECT * FROM vouchers WHERE id = ${id}`;
  const existing = existingRows[0];

  if (!existing) {
    return NextResponse.json({ error: "Voucher tidak ditemukan" }, { status: 404 });
  }

  const body = await req.json().catch(() => null);
  if (!body || Object.keys(body).length === 0) {
    return NextResponse.json({ error: "Data update tidak boleh kosong" }, { status: 400 });
  }

  let code = existing.code;
  if (body.code !== undefined) {
    code = typeof body.code === "string" ? body.code.trim().toUpperCase() : "";
    if (!code) {
      return NextResponse.json({ error: "code tidak boleh kosong" }, { status: 400 });
    }
    const dupCheck = await sql`
      SELECT id FROM vouchers WHERE UPPER(code) = ${code} AND id != ${id}
    `;
    if (dupCheck[0]) {
      return NextResponse.json(
        { error: "Kode voucher sudah digunakan" },
        { status: 409 },
      );
    }
  }

  let discountType = existing.discount_type;
  if (body.discountType !== undefined) {
    discountType = body.discountType;
    if (!["percent", "fixed"].includes(discountType)) {
      return NextResponse.json(
        { error: "discountType wajib 'percent' atau 'fixed'" },
        { status: 400 },
      );
    }
  }

  let discountValue = Number(existing.discount_value);
  if (body.discountValue !== undefined) {
    discountValue = body.discountValue;
    if (typeof discountValue !== "number" || isNaN(discountValue) || discountValue <= 0) {
      return NextResponse.json(
        { error: "discountValue wajib angka positif" },
        { status: 400 },
      );
    }
  }

  const name =
    body.name !== undefined
      ? body.name === null
        ? null
        : String(body.name).trim()
      : existing.name;

  const description =
    body.description !== undefined
      ? body.description === null
        ? null
        : String(body.description).trim()
      : existing.description;

  const maxDiscount =
    body.maxDiscount !== undefined
      ? body.maxDiscount === null
        ? null
        : Number(body.maxDiscount)
      : existing.max_discount;

  const minPurchase =
    body.minPurchase !== undefined
      ? body.minPurchase === null
        ? 0
        : Number(body.minPurchase)
      : existing.min_purchase;

  const validFrom =
    body.validFrom !== undefined
      ? body.validFrom === null
        ? null
        : new Date(body.validFrom)
      : existing.valid_from;

  const validUntil =
    body.validUntil !== undefined
      ? body.validUntil === null
        ? null
        : new Date(body.validUntil)
      : existing.valid_until;

  const usageLimit =
    body.usageLimit !== undefined
      ? body.usageLimit === null
        ? null
        : Number(body.usageLimit)
      : existing.usage_limit;

  const isActive =
    body.isActive !== undefined ? Boolean(body.isActive) : Boolean(existing.is_active);

  const updatedRows = await sql`
    UPDATE vouchers
    SET
      name = ${name},
      description = ${description},
      code = ${code},
      discount_type = ${discountType},
      discount_value = ${discountValue},
      max_discount = ${maxDiscount},
      min_purchase = ${minPurchase},
      valid_from = ${validFrom},
      valid_until = ${validUntil},
      usage_limit = ${usageLimit},
      is_active = ${isActive}
    WHERE id = ${id}
    RETURNING *
  `;


  return NextResponse.json(formatVoucher(updatedRows[0]));
}

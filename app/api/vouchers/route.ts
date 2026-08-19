import { NextResponse } from "next/server";
import { sql } from "@/src/db/client";
import { requireStaff } from "@/lib/auth-middleware";
import { formatVoucher } from "./utils";

/**
 * GET /api/vouchers
 * Staff only — Mengambil semua daftar voucher (admin view).
 */
export async function GET(req: Request) {
  const auth = await requireStaff(req);
  if ("error" in auth) return auth.error;

  const rows = await sql`SELECT * FROM vouchers ORDER BY code ASC`;
  const data = rows.map(formatVoucher);
  return NextResponse.json({ data });
}

/**
 * POST /api/vouchers
 * Super Admin only — Membuat voucher baru.
 */
export async function POST(req: Request) {
  const auth = await requireStaff(req, ["super_admin"]);
  if ("error" in auth) return auth.error;

  const body = await req.json().catch(() => null);
  const code = body?.code?.trim()?.toUpperCase();
  const discountType = body?.discountType;
  const discountValue = body?.discountValue;

  if (!code) {
    return NextResponse.json({ error: "code wajib diisi" }, { status: 400 });
  }

  if (!discountType || !["percent", "fixed"].includes(discountType)) {
    return NextResponse.json(
      { error: "discountType wajib 'percent' atau 'fixed'" },
      { status: 400 },
    );
  }

  if (typeof discountValue !== "number" || isNaN(discountValue) || discountValue <= 0) {
    return NextResponse.json(
      { error: "discountValue wajib diisi dengan angka positif" },
      { status: 400 },
    );
  }

  // Cek duplikasi kode voucher
  const dupCheck = await sql`SELECT id FROM vouchers WHERE UPPER(code) = ${code}`;
  if (dupCheck[0]) {
    return NextResponse.json(
      { error: "Kode voucher sudah digunakan" },
      { status: 409 },
    );
  }

  const name = body?.name?.trim() || null;
  const description = body?.description?.trim() || null;

  const maxDiscount =
    body.maxDiscount !== undefined && body.maxDiscount !== null
      ? Number(body.maxDiscount)
      : null;
  const minPurchase =
    body.minPurchase !== undefined && body.minPurchase !== null
      ? Number(body.minPurchase)
      : 0;
  const validFrom = body.validFrom ? new Date(body.validFrom) : null;
  const validUntil = body.validUntil ? new Date(body.validUntil) : null;
  const usageLimit =
    body.usageLimit !== undefined && body.usageLimit !== null
      ? Number(body.usageLimit)
      : null;

  const insertedRows = await sql`
    INSERT INTO vouchers (
      name,
      description,
      code,
      discount_type,
      discount_value,
      max_discount,
      min_purchase,
      valid_from,
      valid_until,
      usage_limit,
      is_active
    )
    VALUES (
      ${name},
      ${description},
      ${code},
      ${discountType},
      ${discountValue},
      ${maxDiscount},
      ${minPurchase},
      ${validFrom},
      ${validUntil},
      ${usageLimit},
      true
    )
    RETURNING *
  `;

  return NextResponse.json(formatVoucher(insertedRows[0]), { status: 201 });
}


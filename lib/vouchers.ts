import { sql } from "@/src/db/client";

export type VoucherValidationResult =
  | { valid: true; voucher: any; discount: number }
  | { valid: false; error: string };

export async function validateVoucherCode(
  code: string,
  subtotal: number,
  customerId?: string | number,

): Promise<VoucherValidationResult> {
  const cleanCode = code.trim().toUpperCase();
  const rows = await sql`
    SELECT * FROM vouchers
    WHERE UPPER(code) = ${cleanCode} AND is_active = true
  `;
  const voucher = rows[0];
  if (!voucher) {
    return { valid: false, error: "Kode voucher tidak valid atau tidak aktif" };
  }

  const now = new Date();
  if (voucher.valid_from && new Date(voucher.valid_from) > now) {
    return { valid: false, error: "Voucher belum berlaku" };
  }
  if (voucher.valid_until && new Date(voucher.valid_until) < now) {
    return { valid: false, error: "Voucher sudah kadaluarsa" };
  }

  const minPurchase = Number(voucher.min_purchase) || 0;
  if (subtotal < minPurchase) {
    return {
      valid: false,
      error: `Minimal pembelian Rp${minPurchase.toLocaleString("id-ID")} untuk menggunakan voucher ini`,
    };
  }

  if (voucher.usage_limit !== null && voucher.usage_limit !== undefined) {
    const usageCountRows = await sql`
      SELECT COUNT(*)::int AS count FROM orders WHERE voucher_id = ${voucher.id}
    `;
    const count = Number(usageCountRows[0]?.count || 0);
    if (count >= Number(voucher.usage_limit)) {
      return { valid: false, error: "Voucher telah mencapai batas kuota penggunaan" };
    }
  }


  let discount = 0;
  const value = Number(voucher.discount_value);
  if (voucher.discount_type === "percent") {
    discount = Math.floor((subtotal * value) / 100);
    if (voucher.max_discount !== null && voucher.max_discount !== undefined) {
      discount = Math.min(discount, Number(voucher.max_discount));
    }
  } else {
    discount = value;
  }

  discount = Math.min(discount, subtotal);

  return { valid: true, voucher, discount };
}

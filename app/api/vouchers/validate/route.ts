import { NextResponse } from "next/server";
import { validateVoucherCode } from "@/lib/vouchers";

/**
 * POST /api/vouchers/validate
 * Publik / Customer — Validasi voucher & hitung diskon.
 * PENTING: Menggunakan fungsi shared validateVoucherCode dari lib/vouchers.ts
 * yang SAMA persis dengan yang dipakai di POST /api/orders (checkout).
 * HTTP 200 selalu dikembalikan (valid: true/false), ini expected response bukan HTTP Exception.
 */
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const code = body?.code?.trim();
  const subtotal = body?.subtotal;

  if (!code || typeof subtotal !== "number" || isNaN(subtotal) || subtotal < 0) {
    return NextResponse.json({
      valid: false,
      reason: "code dan subtotal wajib diisi dengan benar",
    });
  }

  const result = await validateVoucherCode(code, subtotal);
  if (!result.valid) {
    return NextResponse.json({
      valid: false,
      reason: result.error,
    });
  }

  return NextResponse.json({
    valid: true,
    discount: result.discount,
    voucherId: Number(result.voucher.id),
    voucherName: result.voucher.name ?? null,
  });
}


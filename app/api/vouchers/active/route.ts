import { NextResponse } from "next/server";
import { sql } from "@/src/db/client";
import { formatVoucher } from "../utils";

/**
 * GET /api/vouchers/active
 * Publik — Mengambil daftar voucher aktif (is_active = true DAN belum expired).
 */
export async function GET() {
  const rows = await sql`
    SELECT * FROM vouchers
    WHERE is_active = true AND (valid_until IS NULL OR valid_until >= NOW())
    ORDER BY valid_until ASC NULLS LAST
  `;

  const data = rows.map(formatVoucher);
  return NextResponse.json({ data });
}

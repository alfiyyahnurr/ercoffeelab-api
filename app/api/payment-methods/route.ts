import { NextResponse } from "next/server";
import { sql } from "@/src/db/client";
import { requireStaff } from "@/lib/auth-middleware";
import { getTokenFromRequest, type StaffTokenPayload } from "@/lib/jwt";
import { formatPaymentMethod } from "./utils";

/**
 * GET /api/payment-methods
 * Dual Behavior:
 * - Publik (tanpa staff token): HANYA return is_active = true.
 * - Staff (dengan Authorization token staff): Return SEMUA (termasuk non-aktif).
 * Query param opsional: ?outletId= (return outlet_id IS NULL ATAU outlet_id = outletId).
 */
export async function GET(req: Request) {
  const staffToken = await getTokenFromRequest<StaffTokenPayload>(req);
  const isStaff = staffToken && staffToken.type === "staff";

  const { searchParams } = new URL(req.url);
  const outletIdParam = searchParams.get("outletId");
  const outletIdNum = outletIdParam ? Number(outletIdParam) : null;


  const rows = isStaff
    ? await sql`
        SELECT * FROM payment_methods
        WHERE (${outletIdNum}::bigint IS NULL OR outlet_id IS NULL OR outlet_id = ${outletIdNum}::bigint)
        ORDER BY code ASC
      `
    : await sql`
        SELECT * FROM payment_methods
        WHERE is_active = true
          AND (${outletIdNum}::bigint IS NULL OR outlet_id IS NULL OR outlet_id = ${outletIdNum}::bigint)
        ORDER BY code ASC
      `;


  const data = rows.map(formatPaymentMethod);
  return NextResponse.json({ data });
}

/**
 * POST /api/payment-methods
 * Super Admin only — Menambahkan metode pembayaran baru.
 */
export async function POST(req: Request) {
  const auth = await requireStaff(req, ["super_admin"]);
  if ("error" in auth) return auth.error;

  const body = await req.json().catch(() => null);
  const code = body?.code?.trim()?.toLowerCase();
  const displayName = body?.displayName?.trim();

  if (!code || !displayName) {
    return NextResponse.json(
      { error: "code dan displayName wajib diisi" },
      { status: 400 },
    );
  }

  // Cek duplikasi kode
  const existingRows = await sql`SELECT id FROM payment_methods WHERE LOWER(code) = ${code}`;
  if (existingRows[0]) {
    return NextResponse.json(
      { error: "Kode payment method sudah terdaftar" },
      { status: 409 },
    );
  }

  const provider = body.provider?.trim() || "midtrans";
  const outletId = body.outletId ?? null;

  if (outletId) {
    const outletRows = await sql`SELECT id FROM outlets WHERE id = ${outletId}`;
    if (!outletRows[0]) {
      return NextResponse.json({ error: "Outlet tidak ditemukan" }, { status: 400 });
    }
  }

  const insertedRows = await sql`
    INSERT INTO payment_methods (code, display_name, provider, is_active, outlet_id)
    VALUES (${code}, ${displayName}, ${provider}, true, ${outletId})
    RETURNING *
  `;

  return NextResponse.json(formatPaymentMethod(insertedRows[0]), { status: 201 });
}

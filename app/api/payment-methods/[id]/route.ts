import { NextResponse } from "next/server";
import { sql } from "@/src/db/client";
import { requireStaff } from "@/lib/auth-middleware";
import { formatPaymentMethod } from "../utils";

/**
 * PATCH /api/payment-methods/:id
 * Super Admin only — Update data metode pembayaran (termasuk toggle isActive: false/true).
 */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const auth = await requireStaff(req, ["super_admin"]);
  if ("error" in auth) return auth.error;

  const existingRows = await sql`SELECT * FROM payment_methods WHERE id = ${id}`;
  const existing = existingRows[0];

  if (!existing) {
    return NextResponse.json(
      { error: "Metode pembayaran tidak ditemukan" },
      { status: 404 },
    );
  }

  const body = await req.json().catch(() => null);
  if (!body || Object.keys(body).length === 0) {
    return NextResponse.json({ error: "Data update tidak boleh kosong" }, { status: 400 });
  }

  let code = existing.code;
  if (body.code !== undefined) {
    code = typeof body.code === "string" ? body.code.trim().toLowerCase() : "";
    if (!code) {
      return NextResponse.json({ error: "code tidak boleh kosong" }, { status: 400 });
    }
    const dupCheck = await sql`
      SELECT id FROM payment_methods WHERE LOWER(code) = ${code} AND id != ${id}
    `;
    if (dupCheck[0]) {
      return NextResponse.json(
        { error: "Kode payment method sudah digunakan" },
        { status: 409 },
      );
    }
  }

  let displayName = existing.display_name;
  if (body.displayName !== undefined) {
    displayName = typeof body.displayName === "string" ? body.displayName.trim() : "";
    if (!displayName) {
      return NextResponse.json({ error: "displayName tidak boleh kosong" }, { status: 400 });
    }
  }

  const provider =
    body.provider !== undefined ? String(body.provider).trim() : existing.provider;

  const isActive =
    body.isActive !== undefined ? Boolean(body.isActive) : Boolean(existing.is_active);

  let outletId = existing.outlet_id;
  if (body.outletId !== undefined) {
    outletId = body.outletId ?? null;
    if (outletId) {
      const outletRows = await sql`SELECT id FROM outlets WHERE id = ${outletId}`;
      if (!outletRows[0]) {
        return NextResponse.json({ error: "Outlet tidak ditemukan" }, { status: 400 });
      }
    }
  }

  const updatedRows = await sql`
    UPDATE payment_methods
    SET
      code = ${code},
      display_name = ${displayName},
      provider = ${provider},
      is_active = ${isActive},
      outlet_id = ${outletId}
    WHERE id = ${id}
    RETURNING *
  `;

  return NextResponse.json(formatPaymentMethod(updatedRows[0]));
}

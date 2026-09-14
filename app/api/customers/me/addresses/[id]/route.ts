import { NextResponse } from "next/server";
import { sql } from "@/src/db/client";
import { requireCustomer } from "@/lib/auth-middleware";

/**
 * PUT /api/customers/me/addresses/:id
 * Header: Authorization: Bearer <token_customer>
 * Mengubah data alamat tersimpan berdasarkan ID milik customer yang sedang login.
 */
export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireCustomer(req);
  if ("error" in auth) return auth.error;

  const customerId = auth.payload.sub;
  const { id } = await params;
  const addressId = parseInt(id, 10);

  if (isNaN(addressId)) {
    return NextResponse.json({ error: "ID alamat tidak valid" }, { status: 400 });
  }

  const body = await req.json().catch(() => null);
  const label = body?.label?.trim() || "Rumah";
  const recipient = (body?.recipient || body?.recipientName)?.trim() || "";
  const fullAddress = (body?.fullAddress || body?.addressText)?.trim();
  const isDefault = Boolean(body?.isDefault || body?.isPrimary);

  if (!fullAddress) {
    return NextResponse.json(
      { error: "Alamat lengkap wajib diisi" },
      { status: 400 }
    );
  }

  if (isDefault) {
    await sql`
      UPDATE addresses 
      SET is_default = false 
      WHERE customer_id = ${customerId}
    `;
  }

  const updated = await sql`
    UPDATE addresses
    SET 
      label = ${label},
      recipient = ${recipient},
      full_address = ${fullAddress},
      is_default = ${isDefault}
    WHERE id = ${addressId} AND customer_id = ${customerId}
    RETURNING id, label, recipient, full_address AS "addressText", is_default AS "isPrimary"
  `;

  if (updated.length === 0) {
    return NextResponse.json(
      { error: "Alamat tidak ditemukan atau akses ditolak" },
      { status: 404 }
    );
  }

  return NextResponse.json({
    message: "Alamat berhasil diperbarui",
    address: updated[0],
  });
}

/**
 * DELETE /api/customers/me/addresses/:id
 * Header: Authorization: Bearer <token_customer>
 * Menghapus permanen alamat tersimpan dari database Neon milik customer yang sedang login.
 */
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireCustomer(req);
  if ("error" in auth) return auth.error;

  const customerId = auth.payload.sub;
  const { id } = await params;
  const addressId = parseInt(id, 10);

  if (isNaN(addressId)) {
    return NextResponse.json({ error: "ID alamat tidak valid" }, { status: 400 });
  }

  const deleted = await sql`
    DELETE FROM addresses
    WHERE id = ${addressId} AND customer_id = ${customerId}
    RETURNING id
  `;

  if (deleted.length === 0) {
    return NextResponse.json(
      { error: "Alamat tidak ditemukan atau akses ditolak" },
      { status: 404 }
    );
  }

  return NextResponse.json({
    message: "Alamat berhasil dihapus dari database",
    id: addressId,
  });
}

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
  const detailNotes = (body?.detailNotes || body?.deliveryNotes)?.trim() || null;
  const rawLat = body?.latitude !== undefined && body?.latitude !== null ? parseFloat(body.latitude) : null;
  const rawLng = body?.longitude !== undefined && body?.longitude !== null ? parseFloat(body.longitude) : null;
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
      delivery_notes = ${detailNotes},
      latitude = ${rawLat},
      longitude = ${rawLng},
      is_default = ${isDefault}
    WHERE id = ${addressId} AND customer_id = ${customerId}
    RETURNING id, label, recipient, full_address AS "addressText", delivery_notes AS "detailNotes", latitude, longitude, is_default AS "isPrimary"
  `;

  if (updated.length === 0) {
    return NextResponse.json(
      { error: "Alamat tidak ditemukan atau akses ditolak" },
      { status: 404 }
    );
  }

  const item = updated[0];
  return NextResponse.json({
    message: "Alamat berhasil diperbarui",
    address: {
      id: item.id,
      label: item.label,
      addressText: item.addressText,
      detailNotes: item.detailNotes,
      recipientName: item.recipient,
      latitude: item.latitude !== null && item.latitude !== undefined ? Number(item.latitude) : null,
      longitude: item.longitude !== null && item.longitude !== undefined ? Number(item.longitude) : null,
      isPrimary: item.isPrimary,
    },
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

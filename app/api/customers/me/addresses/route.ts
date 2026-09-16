import { NextResponse } from "next/server";
import { sql } from "@/src/db/client";
import { requireCustomer } from "@/lib/auth-middleware";

/**
 * GET /api/customers/me/addresses
 * Header: Authorization: Bearer <token_customer>
 * Mengambil seluruh daftar alamat tersimpan milik customer yang sedang login.
 */
export async function GET(req: Request) {
  const auth = await requireCustomer(req);
  if ("error" in auth) return auth.error;

  const customerId = auth.payload.sub;

  const rows = await sql`
    SELECT 
      id,
      label,
      recipient,
      full_address AS "addressText",
      delivery_notes AS "detailNotes",
      latitude,
      longitude,
      is_default AS "isPrimary",
      created_at AS "createdAt"
    FROM addresses
    WHERE customer_id = ${customerId}
    ORDER BY is_default DESC, created_at DESC
  `;

  return NextResponse.json({
    data: rows.map((r: any) => ({
      id: r.id,
      label: r.label,
      addressText: r.addressText,
      detailNotes: r.detailNotes,
      recipientName: r.recipient || "Pelanggan",
      recipientPhone: "",
      latitude: r.latitude !== null && r.latitude !== undefined ? Number(r.latitude) : null,
      longitude: r.longitude !== null && r.longitude !== undefined ? Number(r.longitude) : null,
      isPrimary: r.isPrimary,
      createdAt: r.createdAt,
    })),
  });
}

/**
 * POST /api/customers/me/addresses
 * Header: Authorization: Bearer <token_customer>
 * Body: { label: "Rumah", recipient: "ALFIYYAH NUR", fullAddress: "Jl. Melati No. 21", latitude?: number, longitude?: number, isDefault?: boolean }
 *
 * Menambah alamat tersimpan baru untuk customer yang sedang login.
 */
export async function POST(req: Request) {
  const auth = await requireCustomer(req);
  if ("error" in auth) return auth.error;

  const customerId = auth.payload.sub;
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

  // Jika alamat ini di-set sebagai utama/default, un-set default alamat sebelumnya
  if (isDefault) {
    await sql`
      UPDATE addresses 
      SET is_default = false 
      WHERE customer_id = ${customerId}
    `;
  }

  const inserted = await sql`
    INSERT INTO addresses (customer_id, label, recipient, full_address, delivery_notes, latitude, longitude, is_default)
    VALUES (${customerId}, ${label}, ${recipient}, ${fullAddress}, ${detailNotes}, ${rawLat}, ${rawLng}, ${isDefault})
    RETURNING id, label, recipient, full_address AS "addressText", delivery_notes AS "detailNotes", latitude, longitude, is_default AS "isPrimary", created_at
  `;

  const item = inserted[0];
  return NextResponse.json(
    {
      message: "Alamat berhasil disimpan",
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
    },
    { status: 201 }
  );
}

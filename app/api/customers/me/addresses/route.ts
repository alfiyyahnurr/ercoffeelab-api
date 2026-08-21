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
      recipientName: r.recipient || "Pelanggan",
      recipientPhone: "",
      isPrimary: r.isPrimary,
      createdAt: r.createdAt,
    })),
  });
}

/**
 * POST /api/customers/me/addresses
 * Header: Authorization: Bearer <token_customer>
 * Body: { label: "Rumah", recipient: "ALFIYYAH NUR", fullAddress: "Jl. Melati No. 21", isDefault?: boolean }
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
    INSERT INTO addresses (customer_id, label, recipient, full_address, is_default)
    VALUES (${customerId}, ${label}, ${recipient}, ${fullAddress}, ${isDefault})
    RETURNING id, label, recipient, full_address AS "addressText", is_default AS "isPrimary", created_at
  `;

  const item = inserted[0];
  return NextResponse.json(
    {
      message: "Alamat berhasil disimpan",
      address: {
        id: item.id,
        label: item.label,
        addressText: item.addressText,
        recipientName: item.recipient,
        isPrimary: item.isPrimary,
      },
    },
    { status: 201 }
  );
}

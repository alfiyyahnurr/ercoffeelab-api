import { NextResponse } from "next/server";
import { sql } from "@/src/db/client";
import { requireCustomerOrStaff } from "@/lib/auth-middleware";
import { formatCustomer } from "../utils";
import { formatOrder } from "../../orders/utils";

/**
 * GET /api/customers/:id
 * Staff ATAU Customer (hanya profil miliknya sendiri).
 * Mengambil detail profil pelanggan + info loyalty + histori 5-10 pesanan terakhir.
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const targetId = Number(id);
  if (isNaN(targetId)) {
    return NextResponse.json({ error: "ID customer tidak valid" }, { status: 400 });
  }

  const auth = await requireCustomerOrStaff(req);
  if ("error" in auth) return auth.error;

  if (auth.userType === "customer" && String(auth.payload.sub) !== String(targetId)) {
    return NextResponse.json(
      { error: "Tidak mempunyai akses ke profil customer lain" },
      { status: 403 },
    );
  }

  const customerRows = await sql`
    SELECT 
      c.id,
      c.phone,
      c.email,
      c.full_name,
      c.gender,
      c.is_verified,
      c.created_at,
      COALESCE(cl.points, 0) AS points,
      COALESCE(cl.total_orders, 0) AS total_orders,
      lt.id AS tier_id,
      lt.name AS tier_name
    FROM customers c
    LEFT JOIN customer_loyalty cl ON cl.customer_id = c.id
    LEFT JOIN loyalty_tiers lt ON lt.id = cl.tier_id
    WHERE c.id = ${targetId}
  `;

  const customerRow = customerRows[0];
  if (!customerRow) {
    return NextResponse.json({ error: "Customer tidak ditemukan" }, { status: 404 });
  }

  // 5-10 pesanan terakhir
  const orderRows = await sql`
    SELECT 
      o.id,
      o.order_number,
      o.customer_id,
      c.full_name AS customer_name,
      c.phone AS customer_phone,
      o.outlet_id,
      out.name AS outlet_name,
      o.fulfillment_type,
      o.delivery_address,
      o.payment_method_id,
      pm.display_name AS payment_method_name,
      o.subtotal,
      o.discount,
      o.voucher_id,
      o.service_fee,
      o.total,
      o.payment_status,
      o.order_status,
      o.paid_at,
      o.created_at
    FROM orders o
    LEFT JOIN customers c ON c.id = o.customer_id
    LEFT JOIN outlets out ON out.id = o.outlet_id
    LEFT JOIN payment_methods pm ON pm.id = o.payment_method_id
    WHERE o.customer_id = ${targetId}
    ORDER BY o.created_at DESC
    LIMIT 10
  `;

  const formattedProfile = formatCustomer(customerRow);
  const recentOrders = orderRows.map((r: any) => formatOrder(r, [], []));

  return NextResponse.json({
    ...formattedProfile,
    recentOrders,
  });
}

/**
 * PATCH /api/customers/:id
 * Customer (milik sendiri) atau Staff.
 * Update profil customer (fullName, email, gender, phone).
 */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const targetId = Number(id);
  if (isNaN(targetId)) {
    return NextResponse.json({ error: "ID customer tidak valid" }, { status: 400 });
  }

  const auth = await requireCustomerOrStaff(req);
  if ("error" in auth) return auth.error;

  if (auth.userType === "customer" && String(auth.payload.sub) !== String(targetId)) {
    return NextResponse.json(
      { error: "Tidak mempunyai akses untuk memperbarui profil customer lain" },
      { status: 403 },
    );
  }

  const body = await req.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ error: "Body JSON tidak valid" }, { status: 400 });
  }

  const fullName = (body.fullName ?? body.full_name)?.trim();
  const email = body.email?.trim();
  const phone = body.phone?.trim();
  const gender = body.gender?.trim();

  // Validasi unik email/phone jika diubah
  if (email) {
    const existing = await sql`select id from customers where email = ${email} and id != ${targetId} limit 1`;
    if (existing.length > 0) {
      return NextResponse.json({ error: "Email sudah digunakan oleh akun lain" }, { status: 400 });
    }
  }
  if (phone) {
    const existing = await sql`select id from customers where phone = ${phone} and id != ${targetId} limit 1`;
    if (existing.length > 0) {
      return NextResponse.json({ error: "Nomor HP sudah digunakan oleh akun lain" }, { status: 400 });
    }
  }

  const updatedRows = await sql`
    UPDATE customers
    SET 
      full_name = COALESCE(${fullName !== undefined ? fullName : null}, full_name),
      email = COALESCE(${email !== undefined ? email : null}, email),
      phone = COALESCE(${phone !== undefined ? phone : null}, phone),
      gender = COALESCE(${gender !== undefined ? gender : null}, gender),
      updated_at = NOW()
    WHERE id = ${targetId}
    RETURNING id, phone, email, full_name, gender, is_verified, created_at
  `;

  if (updatedRows.length === 0) {
    return NextResponse.json({ error: "Customer tidak ditemukan" }, { status: 404 });
  }

  return NextResponse.json({
    message: "Profil customer berhasil diperbarui",
    customer: formatCustomer(updatedRows[0]),
  });
}

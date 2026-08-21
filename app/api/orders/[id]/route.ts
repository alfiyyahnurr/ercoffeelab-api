import { NextResponse } from "next/server";
import { sql } from "@/src/db/client";
import { requireCustomerOrStaff } from "@/lib/auth-middleware";
import { formatOrder } from "../utils";

/**
 * GET /api/orders/:id
 * Customer ATAU Staff — Mengambil detail lengkap satu pesanan
 * beserta items (order_details) dan histori status (order_status_logs).
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  
  // Validasi ID wajib berupa angka integer
  const numericId = parseInt(id, 10);
  if (isNaN(numericId) || !/^\d+$/.test(id)) {
    return NextResponse.json({ error: "ID order tidak valid (harus berupa angka)" }, { status: 400 });
  }

  const auth = await requireCustomerOrStaff(req);
  if ("error" in auth) return auth.error;

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
    WHERE o.id = ${numericId}
  `;

  const order = orderRows[0];
  if (!order) {
    return NextResponse.json({ error: "Order tidak ditemukan" }, { status: 404 });
  }

  // Pengecekan akses
  if (auth.userType === "customer" && order.customer_id !== auth.payload.sub) {
    return NextResponse.json(
      { error: "Tidak mempunyai akses ke order ini" },
      { status: 403 },
    );
  }

  if (
    auth.userType === "staff" &&
    auth.payload.role === "outlet_admin" &&
    order.outlet_id !== auth.payload.outletId
  ) {
    return NextResponse.json(
      { error: "Tidak mempunyai akses ke order ini" },
      { status: 403 },
    );
  }

  // Fetch items (order_details)
  const itemRows = await sql`
    SELECT * FROM order_details WHERE order_id = ${numericId} ORDER BY id ASC
  `;

  // Fetch status history (order_status_logs)
  const logRows = await sql`
    SELECT 
      l.id,
      l.order_id,
      l.status,
      l.changed_by_staff_id,
      l.changed_at,
      su.full_name AS staff_name
    FROM order_status_logs l
    LEFT JOIN staff_users su ON su.id = l.changed_by_staff_id
    WHERE l.order_id = ${numericId}
    ORDER BY l.changed_at ASC
  `;

  return NextResponse.json(formatOrder(order, itemRows, logRows));
}

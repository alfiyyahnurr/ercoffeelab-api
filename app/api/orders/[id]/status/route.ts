import { NextResponse } from "next/server";
import { sql } from "@/src/db/client";
import { requireStaff } from "@/lib/auth-middleware";

const VALID_STATUSES = [
  "confirmed",
  "preparing",
  "ready",
  "on_delivery",
  "completed",
  "cancelled",
];

/**
 * PATCH /api/orders/:id/status
 * Staff only — Update status alur pesanan (confirmed, preparing, ready, dll).
 * outlet_admin WAJIB difilter order.outlet_id === payload.outletId.
 */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const auth = await requireStaff(req);
  if ("error" in auth) return auth.error;

  const existingRows = await sql`SELECT * FROM orders WHERE id = ${id}`;
  const existingOrder = existingRows[0];

  if (!existingOrder) {
    return NextResponse.json({ error: "Order tidak ditemukan" }, { status: 404 });
  }

  // Scoped check untuk outlet_admin
  if (
    auth.payload.role === "outlet_admin" &&
    existingOrder.outlet_id !== auth.payload.outletId
  ) {
    return NextResponse.json(
      { error: "Tidak mempunyai akses ke order ini" },
      { status: 403 },
    );
  }

  const body = await req.json().catch(() => null);
  const status = body?.status?.trim();

  if (!status || !VALID_STATUSES.includes(status)) {
    return NextResponse.json(
      {
        error: `status tidak valid. Harus salah satu dari: ${VALID_STATUSES.join(", ")}`,
      },
      { status: 400 },
    );
  }

  // Update order status
  const updatedOrderRows = await sql`
    UPDATE orders
    SET order_status = ${status}
    WHERE id = ${id}
    RETURNING id, order_number, order_status, outlet_id
  `;

  // Insert ke order_status_logs
  const logRows = await sql`
    INSERT INTO order_status_logs (order_id, status, changed_by_staff_id)
    VALUES (${id}, ${status}, ${auth.payload.sub})
    RETURNING id, status, changed_by_staff_id, changed_at
  `;

  return NextResponse.json({
    id: updatedOrderRows[0].id,
    orderNumber: updatedOrderRows[0].order_number,
    orderStatus: updatedOrderRows[0].order_status,
    log: {
      id: logRows[0].id,
      status: logRows[0].status,
      changedByStaffId: logRows[0].changed_by_staff_id,
      changedAt: logRows[0].changed_at
        ? new Date(logRows[0].changed_at).toISOString()
        : null,
    },
  });
}

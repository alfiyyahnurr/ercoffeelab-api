import { NextResponse } from "next/server";
import { sql } from "@/src/db/client";
import { requireStaff } from "@/lib/auth-middleware";
import { formatNotificationLog } from "./utils";

/**
 * GET /api/notification-logs
 * Staff only — Mengambil histori notifikasi terkirim (untuk debugging/audit).
 * Query params opsional: ?orderId=&customerId=
 */
export async function GET(req: Request) {
  const auth = await requireStaff(req);
  if ("error" in auth) return auth.error;

  const { searchParams } = new URL(req.url);
  const orderIdParam = searchParams.get("orderId");
  const customerIdParam = searchParams.get("customerId");

  const orderIdNum = orderIdParam && !isNaN(Number(orderIdParam)) ? Number(orderIdParam) : null;
  const customerIdNum = customerIdParam && !isNaN(Number(customerIdParam)) ? Number(customerIdParam) : null;

  const rows = await sql`
    SELECT 
      nl.id,
      nl.template_code,
      nl.order_id,
      o.order_number,
      nl.customer_id,
      c.full_name AS customer_name,
      nl.channel,
      nl.target,
      nl.payload,
      nl.response,
      nl.status,
      nl.created_at
    FROM notification_logs nl
    LEFT JOIN customers c ON c.id = nl.customer_id
    LEFT JOIN orders o ON o.id = nl.order_id
    WHERE (${orderIdNum}::bigint IS NULL OR nl.order_id = ${orderIdNum}::bigint)
      AND (${customerIdNum}::bigint IS NULL OR nl.customer_id = ${customerIdNum}::bigint)
    ORDER BY nl.created_at DESC
  `;

  const data = rows.map(formatNotificationLog);
  return NextResponse.json({ data });
}

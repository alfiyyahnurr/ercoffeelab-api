import { NextResponse } from "next/server";
import { sql } from "@/src/db/client";
import { requireStaff } from "@/lib/auth-middleware";
import { formatAlert } from "../../../utils";

/**
 * PATCH /api/outlets/:id/alerts/:alertId
 * Staff only — Update status is_acknowledged alert
 */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string; alertId: string }> },
) {
  const { id, alertId } = await params;
  const auth = await requireStaff(req);
  if ("error" in auth) return auth.error;

  if (auth.payload.role === "outlet_admin" && auth.payload.outletId !== id) {
    return NextResponse.json(
      { error: "Tidak mempunyai akses ke outlet ini" },
      { status: 403 },
    );
  }

  const existingAlerts = await sql`
    SELECT * FROM outlet_order_alerts 
    WHERE id = ${alertId} AND outlet_id = ${id}
  `;
  if (!existingAlerts[0]) {
    return NextResponse.json({ error: "Alert tidak ditemukan" }, { status: 404 });
  }

  const body = await req.json().catch(() => null);
  const isAcknowledged = body?.isAcknowledged !== undefined ? Boolean(body.isAcknowledged) : true;

  const updatedRows = await sql`
    UPDATE outlet_order_alerts
    SET is_acknowledged = ${isAcknowledged}
    WHERE id = ${alertId} AND outlet_id = ${id}
    RETURNING *
  `;

  const alertWithOrder = await sql`
    SELECT 
      a.id,
      a.outlet_id,
      a.order_id,
      a.is_acknowledged,
      a.created_at,
      o.order_number,
      o.total
    FROM outlet_order_alerts a
    LEFT JOIN orders o ON o.id = a.order_id
    WHERE a.id = ${alertId} AND a.outlet_id = ${id}
  `;

  return NextResponse.json(formatAlert(alertWithOrder[0] || updatedRows[0]));
}


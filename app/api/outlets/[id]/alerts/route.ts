import { NextResponse } from "next/server";
import { sql } from "@/src/db/client";
import { requireStaff } from "@/lib/auth-middleware";
import { formatAlert } from "../../utils";

/**
 * GET /api/outlets/:id/alerts
 * Query param: ?unacknowledged=true
 * Staff only — Scoped: outlet_admin hanya bisa akses outlet_id miliknya
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const auth = await requireStaff(req);
  if ("error" in auth) return auth.error;

  if (auth.payload.role === "outlet_admin" && auth.payload.outletId !== id) {
    return NextResponse.json(
      { error: "Tidak mempunyai akses ke outlet ini" },
      { status: 403 },
    );
  }

  const outletRows = await sql`SELECT id FROM outlets WHERE id = ${id}`;
  if (!outletRows[0]) {
    return NextResponse.json({ error: "Outlet tidak ditemukan" }, { status: 404 });
  }

  const { searchParams } = new URL(req.url);
  const unacknowledgedOnly = searchParams.get("unacknowledged") === "true";

  const rows = unacknowledgedOnly
    ? await sql`
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
        WHERE a.outlet_id = ${id} AND a.is_acknowledged = false
        ORDER BY a.created_at DESC
      `
    : await sql`
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
        WHERE a.outlet_id = ${id}
        ORDER BY a.created_at DESC
      `;


  const data = rows.map(formatAlert);
  return NextResponse.json({ data });
}

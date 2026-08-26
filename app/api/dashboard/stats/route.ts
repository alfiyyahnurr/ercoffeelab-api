import { NextResponse } from "next/server";
import { sql } from "@/src/db/client";
import { requireStaff } from "@/lib/auth-middleware";

/**
 * GET /api/dashboard/stats
 * Staff only — Analytics metrics and recent order alerts for Executive Dashboard.
 */
export async function GET(req: Request) {
  const auth = await requireStaff(req);
  if ("error" in auth) return auth.error;

  const { searchParams } = new URL(req.url);
  const filterOutletParam = searchParams.get("outletId");

  const staffOutletFilter =
    auth.payload.role === "outlet_admin"
      ? Number(auth.payload.outletId)
      : filterOutletParam
      ? Number(filterOutletParam)
      : null;

  // 1. Omset Hari Ini (Today Revenue)
  const revenueRows = await sql`
    SELECT COALESCE(SUM(total), 0) AS today_revenue, COUNT(*) AS today_orders
    FROM orders
    WHERE DATE(created_at) = CURRENT_DATE
      AND (${staffOutletFilter}::bigint IS NULL OR outlet_id = ${staffOutletFilter}::bigint)
      AND payment_status = 'paid'
  `;

  const todayRevenue = Number(revenueRows[0]?.today_revenue || 0);
  const todayOrders = Number(revenueRows[0]?.today_orders || 0);
  const averageOrderValue = todayOrders > 0 ? Math.round(todayRevenue / todayOrders) : 0;

  // 2. Total Pesanan Butuh Diproses (Pending / Preparing)
  const pendingRows = await sql`
    SELECT COUNT(*) AS pending_count
    FROM orders
    WHERE order_status IN ('confirmed', 'preparing', 'checkout')
      AND (${staffOutletFilter}::bigint IS NULL OR outlet_id = ${staffOutletFilter}::bigint)
  `;

  const pendingActionOrders = Number(pendingRows[0]?.pending_count || 0);

  // 3. Pesanan Masuk Terbaru (Latest 5 orders)
  const recentOrdersRows = await sql`
    SELECT 
      o.id,
      o.order_number,
      c.full_name AS customer_name,
      out.name AS outlet_name,
      o.total,
      o.order_status,
      o.payment_status,
      o.created_at
    FROM orders o
    LEFT JOIN customers c ON c.id = o.customer_id
    LEFT JOIN outlets out ON out.id = o.outlet_id
    WHERE (${staffOutletFilter}::bigint IS NULL OR o.outlet_id = ${staffOutletFilter}::bigint)
    ORDER BY o.created_at DESC
    LIMIT 6
  `;

  const recentOrders = recentOrdersRows.map((r: any) => ({
    id: r.id,
    orderNumber: r.order_number,
    customerName: r.customer_name || 'Pelanggan Coffee Lab',
    outletName: r.outlet_name || 'Utama',
    total: Number(r.total || 0),
    orderStatus: r.order_status,
    paymentStatus: r.payment_status,
    createdAt: r.created_at ? new Date(r.created_at).toISOString() : new Date().toISOString(),
  }));

  // 4. Tren Penjualan Harian (Last 7 Days Trend)
  const trendRows = await sql`
    SELECT 
      TO_CHAR(DATE(created_at), 'YYYY-MM-DD') AS date_label,
      COALESCE(SUM(total), 0) AS revenue,
      COUNT(*) AS order_count
    FROM orders
    WHERE created_at >= CURRENT_DATE - INTERVAL '6 days'
      AND (${staffOutletFilter}::bigint IS NULL OR outlet_id = ${staffOutletFilter}::bigint)
      AND payment_status = 'paid'
    GROUP BY DATE(created_at)
    ORDER BY DATE(created_at) ASC
  `;

  const dailySalesTrend = trendRows.map((r: any) => ({
    date: r.date_label,
    revenue: Number(r.revenue || 0),
    orders: Number(r.order_count || 0),
  }));

  let activeOutletName: string | null = null;
  if (staffOutletFilter) {
    const outletRow = await sql`SELECT name FROM outlets WHERE id = ${staffOutletFilter} LIMIT 1`;
    activeOutletName = outletRow[0]?.name ?? null;
  }

  return NextResponse.json({
    todayRevenue,
    todayOrders,
    averageOrderValue,
    pendingActionOrders,
    recentOrders,
    dailySalesTrend,
    activeOutletId: staffOutletFilter,
    activeOutletName,
  });
}

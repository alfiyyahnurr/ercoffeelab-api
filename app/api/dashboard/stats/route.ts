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

  // 1. Omset Hari Ini (Today Revenue in WIB - Asia/Jakarta)
  const revenueRows = await sql`
    SELECT COALESCE(SUM(total), 0) AS today_revenue, COUNT(*) AS today_orders
    FROM orders
    WHERE DATE(created_at AT TIME ZONE 'Asia/Jakarta') = DATE(NOW() AT TIME ZONE 'Asia/Jakarta')
      AND (${staffOutletFilter}::bigint IS NULL OR outlet_id = ${staffOutletFilter}::bigint)
      AND payment_status = 'paid'
      AND order_status != 'cancelled'
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

  // 3. Pesanan Masuk Terbaru (Latest 6 orders)
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

  const rangeParam = (searchParams.get("range") || "daily").toLowerCase();

  // 4. Tren Penjualan Harian/Mingguan/Bulanan/Tahunan (WIB Asia/Jakarta Date Series)
  let trendRows: any[] = [];

  if (rangeParam === "weekly") {
    trendRows = await sql`
      WITH date_series AS (
        SELECT generate_series(
          DATE_TRUNC('week', NOW() AT TIME ZONE 'Asia/Jakarta') - INTERVAL '3 weeks',
          DATE_TRUNC('week', NOW() AT TIME ZONE 'Asia/Jakarta'),
          INTERVAL '1 week'
        )::date AS d
      )
      SELECT 
        TO_CHAR(ds.d, 'YYYY-MM-DD') AS date_label,
        'Minggu ' || TO_CHAR(ds.d, 'W (DD Mon)') AS display_label,
        COALESCE(SUM(o.total), 0) AS revenue,
        COUNT(DISTINCT o.id) AS order_count,
        COALESCE(SUM(CASE WHEN c.name ILIKE '%coffee%' OR c.name ILIKE '%espresso%' THEN od.unit_price * od.qty ELSE 0 END), 0) AS coffee_revenue,
        COALESCE(SUM(CASE WHEN c.name ILIKE '%non%' OR c.name ILIKE '%tea%' OR c.name ILIKE '%chocolate%' THEN od.unit_price * od.qty ELSE 0 END), 0) AS non_coffee_revenue,
        COALESCE(SUM(CASE WHEN c.name ILIKE '%food%' OR c.name ILIKE '%pastry%' OR c.name ILIKE '%snack%' THEN od.unit_price * od.qty ELSE 0 END), 0) AS food_revenue,
        COALESCE(SUM(CASE WHEN c.name IS NULL OR (c.name NOT ILIKE '%coffee%' AND c.name NOT ILIKE '%espresso%' AND c.name NOT ILIKE '%non%' AND c.name NOT ILIKE '%tea%' AND c.name NOT ILIKE '%chocolate%' AND c.name NOT ILIKE '%food%' AND c.name NOT ILIKE '%pastry%' AND c.name NOT ILIKE '%snack%') THEN od.unit_price * od.qty ELSE 0 END), 0) AS other_revenue
      FROM date_series ds
      LEFT JOIN orders o 
        ON DATE_TRUNC('week', o.created_at AT TIME ZONE 'Asia/Jakarta') = ds.d
        AND (${staffOutletFilter}::bigint IS NULL OR o.outlet_id = ${staffOutletFilter}::bigint)
        AND o.payment_status = 'paid'
        AND o.order_status != 'cancelled'
      LEFT JOIN order_details od ON od.order_id = o.id
      LEFT JOIN products p ON p.id = od.product_id
      LEFT JOIN categories c ON c.id = p.category_id
      GROUP BY ds.d
      ORDER BY ds.d ASC
    `;
  } else if (rangeParam === "monthly") {
    trendRows = await sql`
      WITH date_series AS (
        SELECT generate_series(
          DATE_TRUNC('year', NOW() AT TIME ZONE 'Asia/Jakarta'),
          DATE_TRUNC('year', NOW() AT TIME ZONE 'Asia/Jakarta') + INTERVAL '11 months',
          INTERVAL '1 month'
        )::date AS d
      )
      SELECT 
        TO_CHAR(ds.d, 'YYYY-MM') AS date_label,
        TO_CHAR(ds.d, 'Mon') AS display_label,
        COALESCE(SUM(o.total), 0) AS revenue,
        COUNT(DISTINCT o.id) AS order_count,
        COALESCE(SUM(CASE WHEN c.name ILIKE '%coffee%' OR c.name ILIKE '%espresso%' THEN od.unit_price * od.qty ELSE 0 END), 0) AS coffee_revenue,
        COALESCE(SUM(CASE WHEN c.name ILIKE '%non%' OR c.name ILIKE '%tea%' OR c.name ILIKE '%chocolate%' THEN od.unit_price * od.qty ELSE 0 END), 0) AS non_coffee_revenue,
        COALESCE(SUM(CASE WHEN c.name ILIKE '%food%' OR c.name ILIKE '%pastry%' OR c.name ILIKE '%snack%' THEN od.unit_price * od.qty ELSE 0 END), 0) AS food_revenue,
        COALESCE(SUM(CASE WHEN c.name IS NULL OR (c.name NOT ILIKE '%coffee%' AND c.name NOT ILIKE '%espresso%' AND c.name NOT ILIKE '%non%' AND c.name NOT ILIKE '%tea%' AND c.name NOT ILIKE '%chocolate%' AND c.name NOT ILIKE '%food%' AND c.name NOT ILIKE '%pastry%' AND c.name NOT ILIKE '%snack%') THEN od.unit_price * od.qty ELSE 0 END), 0) AS other_revenue
      FROM date_series ds
      LEFT JOIN orders o 
        ON DATE_TRUNC('month', o.created_at AT TIME ZONE 'Asia/Jakarta') = ds.d
        AND (${staffOutletFilter}::bigint IS NULL OR o.outlet_id = ${staffOutletFilter}::bigint)
        AND o.payment_status = 'paid'
        AND o.order_status != 'cancelled'
      LEFT JOIN order_details od ON od.order_id = o.id
      LEFT JOIN products p ON p.id = od.product_id
      LEFT JOIN categories c ON c.id = p.category_id
      GROUP BY ds.d
      ORDER BY ds.d ASC
    `;
  } else if (rangeParam === "yearly") {
    trendRows = await sql`
      WITH date_series AS (
        SELECT generate_series(
          DATE_TRUNC('year', NOW() AT TIME ZONE 'Asia/Jakarta') - INTERVAL '4 years',
          DATE_TRUNC('year', NOW() AT TIME ZONE 'Asia/Jakarta'),
          INTERVAL '1 year'
        )::date AS d
      )
      SELECT 
        TO_CHAR(ds.d, 'YYYY') AS date_label,
        TO_CHAR(ds.d, 'YYYY') AS display_label,
        COALESCE(SUM(o.total), 0) AS revenue,
        COUNT(DISTINCT o.id) AS order_count,
        COALESCE(SUM(CASE WHEN c.name ILIKE '%coffee%' OR c.name ILIKE '%espresso%' THEN od.unit_price * od.qty ELSE 0 END), 0) AS coffee_revenue,
        COALESCE(SUM(CASE WHEN c.name ILIKE '%non%' OR c.name ILIKE '%tea%' OR c.name ILIKE '%chocolate%' THEN od.unit_price * od.qty ELSE 0 END), 0) AS non_coffee_revenue,
        COALESCE(SUM(CASE WHEN c.name ILIKE '%food%' OR c.name ILIKE '%pastry%' OR c.name ILIKE '%snack%' THEN od.unit_price * od.qty ELSE 0 END), 0) AS food_revenue,
        COALESCE(SUM(CASE WHEN c.name IS NULL OR (c.name NOT ILIKE '%coffee%' AND c.name NOT ILIKE '%espresso%' AND c.name NOT ILIKE '%non%' AND c.name NOT ILIKE '%tea%' AND c.name NOT ILIKE '%chocolate%' AND c.name NOT ILIKE '%food%' AND c.name NOT ILIKE '%pastry%' AND c.name NOT ILIKE '%snack%') THEN od.unit_price * od.qty ELSE 0 END), 0) AS other_revenue
      FROM date_series ds
      LEFT JOIN orders o 
        ON DATE_TRUNC('year', o.created_at AT TIME ZONE 'Asia/Jakarta') = ds.d
        AND (${staffOutletFilter}::bigint IS NULL OR o.outlet_id = ${staffOutletFilter}::bigint)
        AND o.payment_status = 'paid'
        AND o.order_status != 'cancelled'
      LEFT JOIN order_details od ON od.order_id = o.id
      LEFT JOIN products p ON p.id = od.product_id
      LEFT JOIN categories c ON c.id = p.category_id
      GROUP BY ds.d
      ORDER BY ds.d ASC
    `;
  } else {
    // Default: daily (7 Hari)
    trendRows = await sql`
      WITH date_series AS (
        SELECT generate_series(
          DATE(NOW() AT TIME ZONE 'Asia/Jakarta') - INTERVAL '6 days',
          DATE(NOW() AT TIME ZONE 'Asia/Jakarta'),
          INTERVAL '1 day'
        )::date AS d
      )
      SELECT 
        TO_CHAR(ds.d, 'YYYY-MM-DD') AS date_label,
        TO_CHAR(ds.d, 'DD Mon') AS display_label,
        COALESCE(SUM(o.total), 0) AS revenue,
        COUNT(DISTINCT o.id) AS order_count,
        COALESCE(SUM(CASE WHEN c.name ILIKE '%coffee%' OR c.name ILIKE '%espresso%' THEN od.unit_price * od.qty ELSE 0 END), 0) AS coffee_revenue,
        COALESCE(SUM(CASE WHEN c.name ILIKE '%non%' OR c.name ILIKE '%tea%' OR c.name ILIKE '%chocolate%' THEN od.unit_price * od.qty ELSE 0 END), 0) AS non_coffee_revenue,
        COALESCE(SUM(CASE WHEN c.name ILIKE '%food%' OR c.name ILIKE '%pastry%' OR c.name ILIKE '%snack%' THEN od.unit_price * od.qty ELSE 0 END), 0) AS food_revenue,
        COALESCE(SUM(CASE WHEN c.name IS NULL OR (c.name NOT ILIKE '%coffee%' AND c.name NOT ILIKE '%espresso%' AND c.name NOT ILIKE '%non%' AND c.name NOT ILIKE '%tea%' AND c.name NOT ILIKE '%chocolate%' AND c.name NOT ILIKE '%food%' AND c.name NOT ILIKE '%pastry%' AND c.name NOT ILIKE '%snack%') THEN od.unit_price * od.qty ELSE 0 END), 0) AS other_revenue
      FROM date_series ds
      LEFT JOIN orders o 
        ON DATE(o.created_at AT TIME ZONE 'Asia/Jakarta') = ds.d
        AND (${staffOutletFilter}::bigint IS NULL OR o.outlet_id = ${staffOutletFilter}::bigint)
        AND o.payment_status = 'paid'
        AND o.order_status != 'cancelled'
      LEFT JOIN order_details od ON od.order_id = o.id
      LEFT JOIN products p ON p.id = od.product_id
      LEFT JOIN categories c ON c.id = p.category_id
      GROUP BY ds.d
      ORDER BY ds.d ASC
    `;
  }

  const dailySalesTrend = trendRows.map((r: any) => ({
    date: r.date_label,
    displayLabel: r.display_label || r.date_label,
    revenue: Number(r.revenue || 0),
    orders: Number(r.order_count || 0),
    coffeeRevenue: Number(r.coffee_revenue || 0),
    nonCoffeeRevenue: Number(r.non_coffee_revenue || 0),
    foodRevenue: Number(r.food_revenue || 0),
    otherRevenue: Number(r.other_revenue || 0),
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

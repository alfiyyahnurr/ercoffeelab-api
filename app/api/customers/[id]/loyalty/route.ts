import { NextResponse } from "next/server";
import { sql } from "@/src/db/client";
import { requireCustomerOrStaff } from "@/lib/auth-middleware";
import { formatLoyaltyTier } from "@/app/api/loyalty-tiers/utils";


/**
 * GET /api/customers/:id/loyalty
 * Staff ATAU Customer (hanya profil miliknya sendiri).
 * Mengambil ringkasan poin, total order, tier saat ini, dan target tier berikutnya (nextTier).
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

  // Cek customer ada
  const custCheck = await sql`SELECT id FROM customers WHERE id = ${targetId}`;
  if (!custCheck[0]) {
    return NextResponse.json({ error: "Customer tidak ditemukan" }, { status: 404 });
  }

  // Ambil loyalty info + current tier
  const loyaltyRows = await sql`
    SELECT 
      COALESCE(cl.points, 0) AS points,
      COALESCE(cl.total_orders, 0) AS total_orders,
      lt.id AS tier_id,
      lt.name AS tier_name,
      lt.min_points AS tier_min_points,
      lt.min_orders AS tier_min_orders,
      lt.benefit_note AS tier_benefit_note,
      lt.sort_order AS tier_sort_order
    FROM customers c
    LEFT JOIN customer_loyalty cl ON cl.customer_id = c.id
    LEFT JOIN loyalty_tiers lt ON lt.id = cl.tier_id
    WHERE c.id = ${targetId}
  `;

  const row = loyaltyRows[0];
  const points = Number(row?.points || 0);
  const totalOrders = Number(row?.total_orders || 0);

  let currentTier = null;
  let currentSortOrder = 0;

  if (row?.tier_id) {
    currentTier = formatLoyaltyTier({
      id: row.tier_id,
      name: row.tier_name,
      min_points: row.tier_min_points,
      min_orders: row.tier_min_orders,
      benefit_note: row.tier_benefit_note,
      sort_order: row.tier_sort_order,
    });
    currentSortOrder = Number(row.tier_sort_order);
  }

  // Cari next tier (tier dengan sort_order lebih tinggi atau min_points lebih tinggi)
  const nextTierRows = await sql`
    SELECT * FROM loyalty_tiers
    WHERE sort_order > ${currentSortOrder} OR min_points > ${points}
    ORDER BY sort_order ASC, min_points ASC
    LIMIT 1
  `;

  const nextTier = nextTierRows[0] ? formatLoyaltyTier(nextTierRows[0]) : null;

  return NextResponse.json({
    points,
    totalOrders,
    tier: currentTier,
    nextTier,
  });
}

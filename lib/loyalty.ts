import { sql } from "@/src/db/client";

/**
 * Dipanggil setiap kali sebuah order jadi 'paid' (webhook Midtrans / simulate).
 * 1 poin per Rp10.000 dari total order (angka bisa diubah/dijadikan konfigurasi nanti).
 */
export async function recalculateLoyaltyTier(
  customerId: number | string,
  orderId: number | string,
  orderTotal: number,
) {

  const earnedPoints = Math.floor(orderTotal / 10000);

  await sql`
    insert into point_transactions (customer_id, order_id, points_change, reason)
    values (${customerId}, ${orderId}, ${earnedPoints}, 'order_paid')
  `;

  const existing =
    await sql`select * from customer_loyalty where customer_id = ${customerId} limit 1`;
  if (existing.length === 0) {
    await sql`
      insert into customer_loyalty (customer_id, points, total_orders)
      values (${customerId}, ${earnedPoints}, 1)
    `;
  } else {
    await sql`
      update customer_loyalty
      set points = points + ${earnedPoints}, total_orders = total_orders + 1, updated_at = now()
      where customer_id = ${customerId}
    `;
  }

  const updated =
    await sql`select * from customer_loyalty where customer_id = ${customerId} limit 1`;
  const loyalty = updated[0];

  const eligibleTiers = await sql`
    select * from loyalty_tiers
    where min_points <= ${loyalty.points}
      and (min_orders is null or min_orders <= ${loyalty.total_orders})
    order by sort_order desc
    limit 1
  `;

  if (eligibleTiers[0]) {
    await sql`update customer_loyalty set tier_id = ${eligibleTiers[0].id} where customer_id = ${customerId}`;
  }

  return {
    earnedPoints,
    points: loyalty.points,
    totalOrders: loyalty.total_orders,
  };
}

import { NextResponse } from "next/server";
import { sql } from "@/src/db/client";
import { requireCustomer } from "@/lib/auth-middleware";

/**
 * POST /api/rewards/:id/redeem
 * Customer only — Menukarkan poin loyalty dengan reward.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const rewardId = Number(id);
  if (isNaN(rewardId)) {
    return NextResponse.json({ error: "ID reward tidak valid" }, { status: 400 });
  }

  const auth = await requireCustomer(req);
  if ("error" in auth) return auth.error;
  const customerId = Number(auth.payload.sub);

  // Ambil reward
  const rewardRows = await sql`SELECT * FROM rewards WHERE id = ${rewardId}`;
  const reward = rewardRows[0];

  if (!reward) {
    return NextResponse.json({ error: "Reward tidak ditemukan" }, { status: 404 });
  }

  const pointCost = Number(reward.point_cost);

  // Ambil poin customer
  const loyaltyRows = await sql`
    SELECT * FROM customer_loyalty WHERE customer_id = ${customerId}
  `;
  const loyalty = loyaltyRows[0];
  const currentPoints = Number(loyalty?.points || 0);

  if (currentPoints < pointCost) {
    return NextResponse.json(
      {
        error: `Poin tidak mencukupi. Anda memiliki ${currentPoints} poin, butuh ${pointCost} poin`,
      },
      { status: 400 },
    );
  }

  const newPoints = currentPoints - pointCost;

  // Update poin customer
  await sql`
    UPDATE customer_loyalty
    SET points = ${newPoints}, updated_at = NOW()
    WHERE customer_id = ${customerId}
  `;

  // Insert transaksi poin negatif
  await sql`
    INSERT INTO point_transactions (customer_id, points_change, reason)
    VALUES (${customerId}, ${-pointCost}, ${`Tukar reward: ${reward.name}`})
  `;

  // Insert penukaran reward
  const redemptionRows = await sql`
    INSERT INTO reward_redemptions (customer_id, reward_id)
    VALUES (${customerId}, ${rewardId})
    RETURNING id, redeemed_at
  `;

  const redemption = redemptionRows[0];

  return NextResponse.json({
    success: true,
    redemptionId: Number(redemption.id),
    rewardName: reward.name,
    pointCost,
    remainingPoints: newPoints,
    redeemedAt: new Date(redemption.redeemed_at).toISOString(),
  });
}

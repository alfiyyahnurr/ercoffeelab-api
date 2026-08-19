export function formatLoyaltyTier(row: any) {
  return {
    id: Number(row.id),
    name: row.name,
    minPoints: Number(row.min_points),
    minOrders: row.min_orders !== null && row.min_orders !== undefined ? Number(row.min_orders) : null,
    benefitNote: row.benefit_note ?? null,
    sortOrder: Number(row.sort_order),
  };
}

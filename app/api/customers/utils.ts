export function formatCustomer(row: any) {
  return {
    id: Number(row.id),
    phone: row.phone ?? null,
    email: row.email ?? null,
    fullName: row.full_name ?? null,
    gender: row.gender ?? null,
    isVerified: Boolean(row.is_verified),
    points: row.points !== null && row.points !== undefined ? Number(row.points) : 0,
    totalOrders: row.total_orders !== null && row.total_orders !== undefined ? Number(row.total_orders) : 0,
    tierId: row.tier_id ? Number(row.tier_id) : null,
    tierName: row.tier_name ?? "Bronze",
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : null,
  };
}

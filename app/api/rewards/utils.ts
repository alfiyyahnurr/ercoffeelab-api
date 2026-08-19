export function formatReward(row: any) {
  return {
    id: Number(row.id),
    name: row.name,
    pointCost: Number(row.point_cost),
    description: row.description ?? null,
  };
}

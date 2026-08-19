export function formatPaymentMethod(row: any) {
  return {
    id: Number(row.id),
    code: row.code,
    displayName: row.display_name,
    provider: row.provider ?? "midtrans",
    isActive: Boolean(row.is_active),
    outletId: row.outlet_id ? Number(row.outlet_id) : null,
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : null,
  };
}

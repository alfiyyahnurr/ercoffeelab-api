export function formatStaffUser(row: any) {
  return {
    id: Number(row.id),
    email: row.email,
    fullName: row.full_name,
    role: row.role,
    outletId: row.outlet_id ? Number(row.outlet_id) : null,
    outletName: row.outlet_name ?? null,
    hasPassword: Boolean(row.password_hash),
    isActive: Boolean(row.is_active),
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : null,
  };
}

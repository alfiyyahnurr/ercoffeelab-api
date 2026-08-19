export function formatOutlet(row: any) {
  return {
    id: Number(row.id),
    name: row.name,
    address: row.address,
    openHour: row.open_hour ?? null,
    closeHour: row.close_hour ?? null,
    isOpen: Boolean(row.is_open),
    latitude: row.latitude !== null && row.latitude !== undefined ? Number(row.latitude) : null,
    longitude: row.longitude !== null && row.longitude !== undefined ? Number(row.longitude) : null,
  };
}

export function formatAlert(row: any) {
  return {
    id: Number(row.id),
    outletId: Number(row.outlet_id),
    orderId: Number(row.order_id),
    orderNumber: row.order_number ?? null,
    total: row.total !== undefined && row.total !== null ? Number(row.total) : null,
    isAcknowledged: Boolean(row.is_acknowledged),
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : null,
  };
}

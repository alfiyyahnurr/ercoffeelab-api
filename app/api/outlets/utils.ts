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
    deliveryFee: row.delivery_fee !== null && row.delivery_fee !== undefined ? Number(row.delivery_fee) : 10000,
    maxDeliveryDistanceKm: row.max_delivery_distance_km !== null && row.max_delivery_distance_km !== undefined ? Number(row.max_delivery_distance_km) : 10,
    isDeliveryEnabled: row.is_delivery_enabled !== null && row.is_delivery_enabled !== undefined ? Boolean(row.is_delivery_enabled) : true,
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

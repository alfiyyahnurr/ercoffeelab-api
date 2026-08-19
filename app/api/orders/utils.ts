export function formatOrderDetail(row: any) {
  return {
    id: Number(row.id),
    orderId: Number(row.order_id),
    productId: row.product_id ? Number(row.product_id) : null,
    productNameSnapshot: row.product_name_snapshot,
    qty: Number(row.qty),
    size: row.size ?? null,
    temperature: row.temperature ?? null,
    sugar: row.sugar ?? null,
    ice: row.ice ?? null,
    unitPrice: Number(row.unit_price),
    addons: Array.isArray(row.addons)
      ? row.addons
      : typeof row.addons === "string"
        ? JSON.parse(row.addons)
        : [],
  };
}

export function formatOrderStatusLog(row: any) {
  return {
    id: Number(row.id),
    orderId: Number(row.order_id),
    status: row.status,
    changedByStaffId: row.changed_by_staff_id ? Number(row.changed_by_staff_id) : null,
    changedByStaffName: row.staff_name ?? null,
    changedAt: row.changed_at ? new Date(row.changed_at).toISOString() : null,
  };
}

export function formatOrder(row: any, items: any[] = [], statusHistory: any[] = []) {
  return {
    id: Number(row.id),
    orderNumber: row.order_number,
    customerId: Number(row.customer_id),
    customerName: row.customer_name ?? null,
    customerPhone: row.customer_phone ?? null,
    outletId: Number(row.outlet_id),
    outletName: row.outlet_name ?? null,
    fulfillmentType: row.fulfillment_type,
    deliveryAddress: row.delivery_address ?? null,
    paymentMethodId: row.payment_method_id ? Number(row.payment_method_id) : null,
    paymentMethodCode: row.payment_method_code ?? null,
    paymentMethodName: row.payment_method_name ?? null,
    subtotal: Number(row.subtotal),
    discount: Number(row.discount),
    voucherId: row.voucher_id ? Number(row.voucher_id) : null,
    serviceFee: Number(row.service_fee),
    total: Number(row.total),
    paymentStatus: row.payment_status,
    orderStatus: row.order_status,
    paidAt: row.paid_at ? new Date(row.paid_at).toISOString() : null,
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : null,
    items: items.map(formatOrderDetail),
    statusHistory: statusHistory.map(formatOrderStatusLog),
  };
}

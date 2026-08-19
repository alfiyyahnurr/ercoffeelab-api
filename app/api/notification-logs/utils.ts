export function formatNotificationLog(row: any) {
  return {
    id: Number(row.id),
    templateCode: row.template_code ?? null,
    orderId: row.order_id ? Number(row.order_id) : null,
    orderNumber: row.order_number ?? null,
    customerId: row.customer_id ? Number(row.customer_id) : null,
    customerName: row.customer_name ?? null,
    channel: row.channel,
    target: row.target,
    payload:
      typeof row.payload === "string"
        ? JSON.parse(row.payload)
        : row.payload ?? null,
    response:
      typeof row.response === "string"
        ? JSON.parse(row.response)
        : row.response ?? null,
    status: row.status,
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : null,
  };
}

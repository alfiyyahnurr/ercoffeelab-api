export function formatVoucher(row: any) {
  return {
    id: Number(row.id),
    name: row.name ?? null,
    description: row.description ?? null,
    code: row.code,
    discountType: row.discount_type,
    discountValue: Number(row.discount_value),
    maxDiscount:
      row.max_discount !== null && row.max_discount !== undefined
        ? Number(row.max_discount)
        : null,
    minPurchase:
      row.min_purchase !== null && row.min_purchase !== undefined
        ? Number(row.min_purchase)
        : 0,
    validFrom: row.valid_from ? new Date(row.valid_from).toISOString() : null,
    validUntil: row.valid_until ? new Date(row.valid_until).toISOString() : null,
    usageLimit:
      row.usage_limit !== null && row.usage_limit !== undefined
        ? Number(row.usage_limit)
        : null,
    isActive: Boolean(row.is_active),
  };
}

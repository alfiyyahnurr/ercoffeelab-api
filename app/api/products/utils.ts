export function formatAddon(row: any) {
  const rawExtraPrice = row.extra_price !== undefined ? row.extra_price : row.extraPrice;
  const rawIsPopular = row.is_popular !== undefined ? row.is_popular : row.isPopular;
  const rawProductId = row.product_id !== undefined ? row.product_id : row.productId;

  return {
    id: row.id !== undefined && row.id !== null ? Number(row.id) : undefined,
    productId: rawProductId !== undefined && rawProductId !== null ? Number(rawProductId) : undefined,
    name: row.name || '',
    extraPrice: typeof rawExtraPrice === 'number' && !isNaN(rawExtraPrice) ? Number(rawExtraPrice) : 0,
    isPopular: Boolean(rawIsPopular),
  };
}

export function formatProduct(row: any, addons: any[] = []) {
  return {
    id: Number(row.id),
    categoryId: row.category_id ? Number(row.category_id) : null,
    categoryName: row.category_name ?? null,
    categoryGroup: row.category_group_name ?? null,
    name: row.name,
    type: row.type,
    basePrice: Number(row.base_price),
    description: row.description ?? null,
    rating: row.rating !== null && row.rating !== undefined ? Number(row.rating) : 0,
    ratingCount: row.rating_count !== null && row.rating_count !== undefined ? Number(row.rating_count) : 0,
    isBestseller: Boolean(row.is_bestseller),
    isNew: Boolean(row.is_new),
    imageUrl: row.image_url ?? null,
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : null,
    addons: addons.map(formatAddon),
  };

}

export function formatProductOutlet(row: any) {
  return {
    id: Number(row.id),
    productId: Number(row.product_id),
    outletId: Number(row.outlet_id),
    isAvailable: Boolean(row.is_available),
    priceOverride: row.price_override !== null && row.price_override !== undefined ? Number(row.price_override) : null,
    stockNote: row.stock_note ?? null,
  };
}

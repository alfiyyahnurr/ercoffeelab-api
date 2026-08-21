import {
  pgTable,
  bigserial,
  bigint,
  text,
  integer,
  boolean,
  timestamp,
  numeric,
  jsonb,
  time,
  doublePrecision,
  unique,
} from "drizzle-orm/pg-core";

// ============================================================================
// AUTH & ROLE
// ============================================================================

export const customers = pgTable("customers", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  phone: text("phone").unique(),
  email: text("email").unique(),
  fullName: text("full_name"),
  gender: text("gender"),
  birthDate: text("birth_date"),
  pin: text("pin"),
  isVerified: boolean("is_verified").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const otpCodes = pgTable("otp_codes", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  target: text("target").notNull(), // email atau no hp
  channel: text("channel").notNull(), // 'email' | 'sms' | 'whatsapp'
  code: text("code").notNull(),
  purpose: text("purpose").notNull(), // 'login' | 'register'
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  consumedAt: timestamp("consumed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const staffUsers = pgTable("staff_users", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  email: text("email").unique().notNull(),
  fullName: text("full_name").notNull(),
  role: text("role").notNull(), // 'super_admin' | 'outlet_admin'
  outletId: bigint("outlet_id", { mode: "number" }).references(() => outlets.id),
  passwordHash: text("password_hash"), // null = staff ini cuma bisa login lewat SSO
  ssoProvider: text("sso_provider"),
  ssoSubject: text("sso_subject"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ============================================================================
// OUTLET, CATEGORY, PRODUCT, PRODUCT x OUTLET
// ============================================================================

export const outlets = pgTable("outlets", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  name: text("name").notNull(),
  address: text("address").notNull(),
  openHour: time("open_hour"),
  closeHour: time("close_hour"),
  isOpen: boolean("is_open").notNull().default(true),
  latitude: doublePrecision("latitude"),
  longitude: doublePrecision("longitude"),
});

export const categories = pgTable("categories", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  name: text("name").notNull(),
  groupName: text("group_name").notNull(), // 'beverage' | 'food'
});

export const products = pgTable("products", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  categoryId: bigint("category_id", { mode: "number" }).references(() => categories.id),
  name: text("name").notNull(),
  type: text("type").notNull(), // 'beverage' | 'food'
  basePrice: integer("base_price").notNull(),
  description: text("description"),
  rating: numeric("rating", { precision: 2, scale: 1 }).default("0"),
  ratingCount: integer("rating_count").default(0),
  isBestseller: boolean("is_bestseller").default(false),
  imageUrl: text("image_url"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});


export const productAddons = pgTable("product_addons", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  productId: bigint("product_id", { mode: "number" }).notNull().references(() => products.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  extraPrice: integer("extra_price").notNull().default(0),
  isPopular: boolean("is_popular").notNull().default(false),
});

// Ketersediaan & harga produk per outlet
export const productOutlets = pgTable(
  "product_outlets",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    productId: bigint("product_id", { mode: "number" }).notNull().references(() => products.id, { onDelete: "cascade" }),
    outletId: bigint("outlet_id", { mode: "number" }).notNull().references(() => outlets.id, { onDelete: "cascade" }),
    isAvailable: boolean("is_available").notNull().default(true),
    priceOverride: integer("price_override"), // null = pakai products.basePrice
    stockNote: text("stock_note"),
  },
  (t) => ({
    productOutletUnique: unique().on(t.productId, t.outletId),
  }),
);

// ============================================================================
// PAYMENT METHOD + PAYMENT LOG
// ============================================================================

export const paymentMethods = pgTable("payment_methods", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  code: text("code").notNull().unique(), // 'gopay' | 'qris' | 'bank_transfer' | 'cash'
  displayName: text("display_name").notNull(),
  provider: text("provider").notNull().default("midtrans"),
  isActive: boolean("is_active").notNull().default(true),
  outletId: bigint("outlet_id", { mode: "number" }).references(() => outlets.id), // null = berlaku semua outlet
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const paymentLogs = pgTable("payment_logs", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  orderId: bigint("order_id", { mode: "number" }).notNull().references(() => orders.id),
  direction: text("direction").notNull(), // 'request' | 'response' | 'webhook'
  provider: text("provider").notNull().default("midtrans"),
  payload: jsonb("payload").notNull(),
  httpStatus: integer("http_status"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ============================================================================
// VOUCHER
// ============================================================================

export const vouchers = pgTable("vouchers", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  name: text("name"), // Nama/Judul voucher (misal: "Promo Kemerdekaan 20%")
  description: text("description"), // Deskripsi voucher
  code: text("code").notNull().unique(),
  discountType: text("discount_type").notNull(), // 'percent' | 'fixed'
  discountValue: integer("discount_value").notNull(),
  maxDiscount: integer("max_discount"),
  minPurchase: integer("min_purchase").default(0),
  validFrom: timestamp("valid_from", { withTimezone: true }),
  validUntil: timestamp("valid_until", { withTimezone: true }),
  usageLimit: integer("usage_limit"),
  isActive: boolean("is_active").notNull().default(true),
});


export const customerVouchers = pgTable(
  "customer_vouchers",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    customerId: bigint("customer_id", { mode: "number" }).notNull().references(() => customers.id),
    voucherId: bigint("voucher_id", { mode: "number" }).notNull().references(() => vouchers.id),
    claimedAt: timestamp("claimed_at", { withTimezone: true }).notNull().defaultNow(),
    usedAt: timestamp("used_at", { withTimezone: true }),
  },
  (t) => ({
    customerVoucherUnique: unique().on(t.customerId, t.voucherId),
  }),
);

// ============================================================================
// ORDER — PARENT / CHILD order_details
// ============================================================================

export const orders = pgTable("orders", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  orderNumber: text("order_number").notNull().unique(),
  customerId: bigint("customer_id", { mode: "number" }).notNull().references(() => customers.id),
  outletId: bigint("outlet_id", { mode: "number" }).notNull().references(() => outlets.id),
  fulfillmentType: text("fulfillment_type").notNull(), // 'pickup' | 'delivery'
  deliveryAddress: text("delivery_address"),
  paymentMethodId: bigint("payment_method_id", { mode: "number" }).references(() => paymentMethods.id),
  subtotal: integer("subtotal").notNull(),
  discount: integer("discount").notNull().default(0),
  voucherId: bigint("voucher_id", { mode: "number" }).references(() => vouchers.id),
  serviceFee: integer("service_fee").notNull().default(0),
  total: integer("total").notNull(),
  paymentStatus: text("payment_status").notNull().default("unpaid"), // 'unpaid' | 'paid'
  orderStatus: text("order_status").notNull().default("checkout"),
  paidAt: timestamp("paid_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const orderDetails = pgTable("order_details", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  orderId: bigint("order_id", { mode: "number" }).notNull().references(() => orders.id, { onDelete: "cascade" }),
  productId: bigint("product_id", { mode: "number" }).references(() => products.id),
  productNameSnapshot: text("product_name_snapshot").notNull(),
  qty: integer("qty").notNull().default(1),
  size: text("size"),
  temperature: text("temperature"),
  sugar: text("sugar"),
  ice: text("ice"),
  unitPrice: integer("unit_price").notNull(),
  addons: jsonb("addons").notNull().default([]),
});

export const orderStatusLogs = pgTable("order_status_logs", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  orderId: bigint("order_id", { mode: "number" }).notNull().references(() => orders.id, { onDelete: "cascade" }),
  status: text("status").notNull(),
  changedByStaffId: bigint("changed_by_staff_id", { mode: "number" }).references(() => staffUsers.id),
  changedAt: timestamp("changed_at", { withTimezone: true }).notNull().defaultNow(),
});

export const outletOrderAlerts = pgTable("outlet_order_alerts", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  outletId: bigint("outlet_id", { mode: "number" }).notNull().references(() => outlets.id),
  orderId: bigint("order_id", { mode: "number" }).notNull().references(() => orders.id),
  isAcknowledged: boolean("is_acknowledged").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ============================================================================
// LOYALTY — TIER OTOMATIS
// ============================================================================

export const loyaltyTiers = pgTable("loyalty_tiers", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  name: text("name").notNull(), // 'Bronze' | 'Silver' | 'Gold' | 'Platinum'
  minPoints: integer("min_points").notNull(),
  minOrders: integer("min_orders"),
  benefitNote: text("benefit_note"),
  sortOrder: integer("sort_order").notNull(),
});

export const customerLoyalty = pgTable("customer_loyalty", {
  customerId: bigint("customer_id", { mode: "number" }).primaryKey().references(() => customers.id),
  points: integer("points").notNull().default(0),
  totalOrders: integer("total_orders").notNull().default(0),
  tierId: bigint("tier_id", { mode: "number" }).references(() => loyaltyTiers.id),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const pointTransactions = pgTable("point_transactions", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  customerId: bigint("customer_id", { mode: "number" }).notNull().references(() => customers.id),
  orderId: bigint("order_id", { mode: "number" }).references(() => orders.id),
  pointsChange: integer("points_change").notNull(),
  reason: text("reason"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const rewards = pgTable("rewards", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  name: text("name").notNull(),
  pointCost: integer("point_cost").notNull(),
  description: text("description"),
});

export const rewardRedemptions = pgTable("reward_redemptions", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  customerId: bigint("customer_id", { mode: "number" }).notNull().references(() => customers.id),
  rewardId: bigint("reward_id", { mode: "number" }).notNull().references(() => rewards.id),
  redeemedAt: timestamp("redeemed_at", { withTimezone: true }).notNull().defaultNow(),
});

// ============================================================================
// NOTIFICATION — TEMPLATE CRUD + LOG
// ============================================================================

export const notificationTemplates = pgTable("notification_templates", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  code: text("code").notNull().unique(),
  channel: text("channel").notNull(),
  subject: text("subject"),
  bodyTemplate: text("body_template").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const notificationLogs = pgTable("notification_logs", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  templateCode: text("template_code").references(() => notificationTemplates.code),
  orderId: bigint("order_id", { mode: "number" }).references(() => orders.id),
  customerId: bigint("customer_id", { mode: "number" }).references(() => customers.id),
  channel: text("channel").notNull(),
  target: text("target").notNull(),
  payload: jsonb("payload").notNull(),
  response: jsonb("response"),
  status: text("status").notNull().default("pending"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ============================================================================
// FAVORITE, ADDRESS
// ============================================================================

export const favorites = pgTable(
  "favorites",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    customerId: bigint("customer_id", { mode: "number" }).notNull().references(() => customers.id, { onDelete: "cascade" }),
    productId: bigint("product_id", { mode: "number" }).notNull().references(() => products.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({ favoriteUnique: unique().on(t.customerId, t.productId) }),
);

export const addresses = pgTable("addresses", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  customerId: bigint("customer_id", { mode: "number" }).notNull().references(() => customers.id, { onDelete: "cascade" }),
  label: text("label").notNull(),
  recipient: text("recipient"),
  fullAddress: text("full_address").notNull(),
  isDefault: boolean("is_default").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
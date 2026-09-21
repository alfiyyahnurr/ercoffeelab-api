-- ============================================================================
-- ERCoffeeLab Complete Database Schema (PostgreSQL / Neon)
-- Generated to match 100% with Drizzle ORM Schema (apps/api/src/db/schema.ts)
-- ============================================================================

-- Enable pgcrypto extension if needed for UUID or hashing
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================================
-- 1. AUTH & ROLE TABLES
-- ============================================================================

-- Customers: Customer accounts (Mobile App)
CREATE TABLE IF NOT EXISTS "customers" (
    "id" BIGSERIAL PRIMARY KEY NOT NULL,
    "phone" TEXT UNIQUE,
    "email" TEXT UNIQUE,
    "full_name" TEXT,
    "gender" TEXT,
    "birth_date" TEXT,
    "pin" TEXT,
    "is_verified" BOOLEAN DEFAULT false NOT NULL,
    "created_at" TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

-- OTP Codes: One-Time Password tracking for WhatsApp/Email verification
CREATE TABLE IF NOT EXISTS "otp_codes" (
    "id" BIGSERIAL PRIMARY KEY NOT NULL,
    "target" TEXT NOT NULL,
    "channel" TEXT NOT NULL, -- 'whatsapp' | 'email' | 'sms'
    "code" TEXT NOT NULL,
    "purpose" TEXT NOT NULL, -- 'login' | 'register'
    "expires_at" TIMESTAMP WITH TIME ZONE NOT NULL,
    "consumed_at" TIMESTAMP WITH TIME ZONE,
    "created_at" TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

-- ============================================================================
-- 2. OUTLET, CATEGORY & PRODUCT MASTER TABLES
-- ============================================================================

-- Outlets: Store branches
CREATE TABLE IF NOT EXISTS "outlets" (
    "id" BIGSERIAL PRIMARY KEY NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "open_hour" TIME,
    "close_hour" TIME,
    "is_open" BOOLEAN DEFAULT true NOT NULL,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "delivery_fee" INTEGER DEFAULT 10000 NOT NULL,
    "max_delivery_distance_km" NUMERIC(5, 2) DEFAULT 10.00 NOT NULL,
    "is_delivery_enabled" BOOLEAN DEFAULT true NOT NULL
);

-- Delivery Tiers: Distance-based delivery fee pricing rules (Global or per-outlet)
CREATE TABLE IF NOT EXISTS "delivery_tiers" (
    "id" BIGSERIAL PRIMARY KEY NOT NULL,
    "outlet_id" BIGINT REFERENCES "outlets"("id") ON DELETE CASCADE,
    "min_distance_km" NUMERIC(5, 2) DEFAULT 0.00 NOT NULL,
    "max_distance_km" NUMERIC(5, 2) NOT NULL,
    "fee" INTEGER NOT NULL,
    "is_active" BOOLEAN DEFAULT true NOT NULL,
    "created_at" TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

-- Staff Users: Admin panel operators (super_admin & outlet_admin)
CREATE TABLE IF NOT EXISTS "staff_users" (
    "id" BIGSERIAL PRIMARY KEY NOT NULL,
    "email" TEXT NOT NULL UNIQUE,
    "full_name" TEXT NOT NULL,
    "role" TEXT NOT NULL, -- 'super_admin' | 'outlet_admin'
    "outlet_id" BIGINT REFERENCES "outlets"("id") ON DELETE SET NULL,
    "password_hash" TEXT, -- NULL if Google SSO-only
    "sso_provider" TEXT,
    "sso_subject" TEXT,
    "is_active" BOOLEAN DEFAULT true NOT NULL,
    "created_at" TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

-- Categories: Menu categories
CREATE TABLE IF NOT EXISTS "categories" (
    "id" BIGSERIAL PRIMARY KEY NOT NULL,
    "name" TEXT NOT NULL,
    "group_name" TEXT NOT NULL -- 'beverage' | 'food'
);

-- Products: Master products catalog (Global)
CREATE TABLE IF NOT EXISTS "products" (
    "id" BIGSERIAL PRIMARY KEY NOT NULL,
    "category_id" BIGINT REFERENCES "categories"("id") ON DELETE SET NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL, -- 'beverage' | 'food'
    "base_price" INTEGER NOT NULL,
    "description" TEXT,
    "rating" NUMERIC(2, 1) DEFAULT '0',
    "rating_count" INTEGER DEFAULT 0,
    "is_bestseller" BOOLEAN DEFAULT false,
    "image_url" TEXT,
    "created_at" TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

-- Product Addons: Extra toppings, shots, milk alternatives
CREATE TABLE IF NOT EXISTS "product_addons" (
    "id" BIGSERIAL PRIMARY KEY NOT NULL,
    "product_id" BIGINT NOT NULL REFERENCES "products"("id") ON DELETE CASCADE,
    "name" TEXT NOT NULL,
    "extra_price" INTEGER DEFAULT 0 NOT NULL,
    "is_popular" BOOLEAN DEFAULT false NOT NULL
);

-- Product Outlets: Outlet-specific menu availability and price override
CREATE TABLE IF NOT EXISTS "product_outlets" (
    "id" BIGSERIAL PRIMARY KEY NOT NULL,
    "product_id" BIGINT NOT NULL REFERENCES "products"("id") ON DELETE CASCADE,
    "outlet_id" BIGINT NOT NULL REFERENCES "outlets"("id") ON DELETE CASCADE,
    "is_available" BOOLEAN DEFAULT true NOT NULL,
    "price_override" INTEGER, -- NULL = use products.base_price
    "stock_note" TEXT,
    CONSTRAINT "product_outlets_product_id_outlet_id_unique" UNIQUE("product_id", "outlet_id")
);

-- ============================================================================
-- 3. PAYMENT METHODS & LOGS
-- ============================================================================

-- Payment Methods: Available payment channels
CREATE TABLE IF NOT EXISTS "payment_methods" (
    "id" BIGSERIAL PRIMARY KEY NOT NULL,
    "code" TEXT NOT NULL UNIQUE, -- 'gopay' | 'qris' | 'bank_transfer' | 'cash'
    "display_name" TEXT NOT NULL,
    "provider" TEXT DEFAULT 'midtrans' NOT NULL,
    "is_active" BOOLEAN DEFAULT true NOT NULL,
    "outlet_id" BIGINT REFERENCES "outlets"("id") ON DELETE SET NULL, -- NULL = Global for all outlets
    "created_at" TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

-- ============================================================================
-- 4. VOUCHERS & PROMOTIONS
-- ============================================================================

-- Vouchers: Promo codes and discounts
CREATE TABLE IF NOT EXISTS "vouchers" (
    "id" BIGSERIAL PRIMARY KEY NOT NULL,
    "name" TEXT,
    "description" TEXT,
    "code" TEXT NOT NULL UNIQUE,
    "discount_type" TEXT NOT NULL, -- 'percent' | 'fixed'
    "discount_value" INTEGER NOT NULL,
    "max_discount" INTEGER,
    "min_purchase" INTEGER DEFAULT 0,
    "valid_from" TIMESTAMP WITH TIME ZONE,
    "valid_until" TIMESTAMP WITH TIME ZONE,
    "usage_limit" INTEGER,
    "is_active" BOOLEAN DEFAULT true NOT NULL
);

-- Customer Vouchers: Tracking voucher claims & usage per customer
CREATE TABLE IF NOT EXISTS "customer_vouchers" (
    "id" BIGSERIAL PRIMARY KEY NOT NULL,
    "customer_id" BIGINT NOT NULL REFERENCES "customers"("id") ON DELETE CASCADE,
    "voucher_id" BIGINT NOT NULL REFERENCES "vouchers"("id") ON DELETE CASCADE,
    "claimed_at" TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
    "used_at" TIMESTAMP WITH TIME ZONE,
    CONSTRAINT "customer_vouchers_customer_id_voucher_id_unique" UNIQUE("customer_id", "voucher_id")
);

-- ============================================================================
-- 5. ORDERS & FULFILLMENT
-- ============================================================================

-- -- Orders: Parent order header
CREATE TABLE IF NOT EXISTS "orders" (
    "id" BIGSERIAL PRIMARY KEY NOT NULL,
    "order_number" TEXT NOT NULL UNIQUE,
    "customer_id" BIGINT NOT NULL REFERENCES "customers"("id"),
    "outlet_id" BIGINT NOT NULL REFERENCES "outlets"("id"),
    "fulfillment_type" TEXT NOT NULL, -- 'pickup' | 'delivery'
    "delivery_address" TEXT,
    "delivery_fee" INTEGER DEFAULT 0 NOT NULL,
    "delivery_distance_km" NUMERIC(5, 2),
    "delivery_latitude" DOUBLE PRECISION,
    "delivery_longitude" DOUBLE PRECISION,
    "payment_method_id" BIGINT REFERENCES "payment_methods"("id"),
    "subtotal" INTEGER NOT NULL,
    "discount" INTEGER DEFAULT 0 NOT NULL,
    "voucher_id" BIGINT REFERENCES "vouchers"("id"),
    "service_fee" INTEGER DEFAULT 0 NOT NULL,
    "total" INTEGER NOT NULL,
    "payment_status" TEXT DEFAULT 'unpaid' NOT NULL, -- 'unpaid' | 'paid'
    "order_status" TEXT DEFAULT 'checkout' NOT NULL, -- 'checkout' | 'pending' | 'preparing' | 'ready' | 'on_delivery' | 'completed' | 'cancelled'
    "paid_at" TIMESTAMP WITH TIME ZONE,
    "created_at" TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

-- Order Details: Child order items with snapshot data
CREATE TABLE IF NOT EXISTS "order_details" (
    "id" BIGSERIAL PRIMARY KEY NOT NULL,
    "order_id" BIGINT NOT NULL REFERENCES "orders"("id") ON DELETE CASCADE,
    "product_id" BIGINT REFERENCES "products"("id") ON DELETE SET NULL,
    "product_name_snapshot" TEXT NOT NULL,
    "qty" INTEGER DEFAULT 1 NOT NULL,
    "size" TEXT,
    "temperature" TEXT,
    "sugar" TEXT,
    "ice" TEXT,
    "unit_price" INTEGER NOT NULL,
    "addons" JSONB DEFAULT '[]'::jsonb NOT NULL
);

-- Order Status Logs: Audit trail of order status changes
CREATE TABLE IF NOT EXISTS "order_status_logs" (
    "id" BIGSERIAL PRIMARY KEY NOT NULL,
    "order_id" BIGINT NOT NULL REFERENCES "orders"("id") ON DELETE CASCADE,
    "status" TEXT NOT NULL,
    "changed_by_staff_id" BIGINT REFERENCES "staff_users"("id"),
    "changed_at" TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

-- Outlet Order Alerts: Notification bar badge for incoming new orders at store level
CREATE TABLE IF NOT EXISTS "outlet_order_alerts" (
    "id" BIGSERIAL PRIMARY KEY NOT NULL,
    "outlet_id" BIGINT NOT NULL REFERENCES "outlets"("id") ON DELETE CASCADE,
    "order_id" BIGINT NOT NULL REFERENCES "orders"("id") ON DELETE CASCADE,
    "is_acknowledged" BOOLEAN DEFAULT false NOT NULL,
    "created_at" TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

-- Payment Logs: Midtrans request/response/webhook audit logs
CREATE TABLE IF NOT EXISTS "payment_logs" (
    "id" BIGSERIAL PRIMARY KEY NOT NULL,
    "order_id" BIGINT NOT NULL REFERENCES "orders"("id") ON DELETE CASCADE,
    "direction" TEXT NOT NULL, -- 'request' | 'response' | 'webhook'
    "provider" TEXT DEFAULT 'midtrans' NOT NULL,
    "payload" JSONB NOT NULL,
    "http_status" INTEGER,
    "created_at" TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

-- ============================================================================
-- 6. LOYALTY & REWARDS
-- ============================================================================

-- Loyalty Tiers: Membership levels (Bronze, Silver, Gold, Platinum)
CREATE TABLE IF NOT EXISTS "loyalty_tiers" (
    "id" BIGSERIAL PRIMARY KEY NOT NULL,
    "name" TEXT NOT NULL,
    "min_points" INTEGER NOT NULL,
    "min_orders" INTEGER,
    "benefit_note" TEXT,
    "sort_order" INTEGER NOT NULL
);

-- Customer Loyalty: Points and tier state per customer
CREATE TABLE IF NOT EXISTS "customer_loyalty" (
    "customer_id" BIGINT PRIMARY KEY NOT NULL REFERENCES "customers"("id") ON DELETE CASCADE,
    "points" INTEGER DEFAULT 0 NOT NULL,
    "total_orders" INTEGER DEFAULT 0 NOT NULL,
    "tier_id" BIGINT REFERENCES "loyalty_tiers"("id") ON DELETE SET NULL,
    "updated_at" TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

-- Point Transactions: History of points earned / spent
CREATE TABLE IF NOT EXISTS "point_transactions" (
    "id" BIGSERIAL PRIMARY KEY NOT NULL,
    "customer_id" BIGINT NOT NULL REFERENCES "customers"("id") ON DELETE CASCADE,
    "order_id" BIGINT REFERENCES "orders"("id") ON DELETE SET NULL,
    "points_change" INTEGER NOT NULL,
    "reason" TEXT,
    "created_at" TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

-- Rewards: Redeemable catalog items
CREATE TABLE IF NOT EXISTS "rewards" (
    "id" BIGSERIAL PRIMARY KEY NOT NULL,
    "name" TEXT NOT NULL,
    "point_cost" INTEGER NOT NULL,
    "description" TEXT
);

-- Reward Redemptions: History of customer rewards redemption
CREATE TABLE IF NOT EXISTS "reward_redemptions" (
    "id" BIGSERIAL PRIMARY KEY NOT NULL,
    "customer_id" BIGINT NOT NULL REFERENCES "customers"("id") ON DELETE CASCADE,
    "reward_id" BIGINT NOT NULL REFERENCES "rewards"("id") ON DELETE CASCADE,
    "redeemed_at" TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

-- ============================================================================
-- 7. NOTIFICATIONS & TEMPLATES
-- ============================================================================

-- Notification Templates: WhatsApp and Email message templates
CREATE TABLE IF NOT EXISTS "notification_templates" (
    "id" BIGSERIAL PRIMARY KEY NOT NULL,
    "code" TEXT NOT NULL UNIQUE,
    "channel" TEXT NOT NULL, -- 'whatsapp' | 'email' | 'both'
    "subject" TEXT,
    "body_template" TEXT NOT NULL,
    "is_active" BOOLEAN DEFAULT true NOT NULL,
    "created_at" TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

-- Notification Logs: Audit history of sent messages
CREATE TABLE IF NOT EXISTS "notification_logs" (
    "id" BIGSERIAL PRIMARY KEY NOT NULL,
    "template_code" TEXT REFERENCES "notification_templates"("code") ON DELETE SET NULL,
    "order_id" BIGINT REFERENCES "orders"("id") ON DELETE SET NULL,
    "customer_id" BIGINT REFERENCES "customers"("id") ON DELETE SET NULL,
    "channel" TEXT NOT NULL,
    "target" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "response" JSONB,
    "status" TEXT DEFAULT 'pending' NOT NULL, -- 'sent' | 'failed' | 'simulated' | 'pending'
    "created_at" TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

-- ============================================================================
-- 8. CUSTOMER EXTRAS (FAVORITES & SAVED ADDRESSES)
-- ============================================================================

-- Favorites: Customer bookmarked products
CREATE TABLE IF NOT EXISTS "favorites" (
    "id" BIGSERIAL PRIMARY KEY NOT NULL,
    "customer_id" BIGINT NOT NULL REFERENCES "customers"("id") ON DELETE CASCADE,
    "product_id" BIGINT NOT NULL REFERENCES "products"("id") ON DELETE CASCADE,
    "created_at" TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
    CONSTRAINT "favorites_customer_id_product_id_unique" UNIQUE("customer_id", "product_id")
);

-- Addresses: Customer saved delivery addresses
CREATE TABLE IF NOT EXISTS "addresses" (
    "id" BIGSERIAL PRIMARY KEY NOT NULL,
    "customer_id" BIGINT NOT NULL REFERENCES "customers"("id") ON DELETE CASCADE,
    "label" TEXT NOT NULL,
    "recipient" TEXT,
    "full_address" TEXT NOT NULL,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "delivery_notes" TEXT,
    "is_default" BOOLEAN DEFAULT false NOT NULL,
    "created_at" TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

-- ============================================================================
-- 9. PERFORMANCE INDEXES
-- ============================================================================

CREATE INDEX IF NOT EXISTS "idx_orders_customer_id" ON "orders"("customer_id");
CREATE INDEX IF NOT EXISTS "idx_orders_outlet_id" ON "orders"("outlet_id");
CREATE INDEX IF NOT EXISTS "idx_orders_order_status" ON "orders"("order_status");
CREATE INDEX IF NOT EXISTS "idx_orders_created_at" ON "orders"("created_at" DESC);
CREATE INDEX IF NOT EXISTS "idx_product_outlets_outlet_id" ON "product_outlets"("outlet_id");
CREATE INDEX IF NOT EXISTS "idx_outlet_alerts_outlet_unack" ON "outlet_order_alerts"("outlet_id") WHERE "is_acknowledged" = false;
CREATE INDEX IF NOT EXISTS "idx_delivery_tiers_outlet_id" ON "delivery_tiers"("outlet_id");

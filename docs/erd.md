# ERD — ERCoffeeLab Database

Source of truth: `src/db/schema.ts` (Drizzle). Semua ID pakai `bigserial` (64-bit integer auto-increment), timestamp pakai `timestamptz`.


## Diagram relasi
```
customers ──┬── customer_loyalty ──── loyalty_tiers
            ├── otp_codes (by target, tidak FK langsung)
            ├── orders ──┬── order_details
            │            ├── order_status_logs ── staff_users (changed_by, nullable)
            │            ├── payment_logs
            │            └── outlet_order_alerts
            ├── customer_vouchers ──── vouchers
            ├── point_transactions
            ├── reward_redemptions ──── rewards
            ├── addresses
            └── favorites ──── products

outlets ──┬── product_outlets ──── products ──── product_addons
          ├── orders
          ├── payment_methods (nullable outlet_id = global)
          └── staff_users (outlet_admin, nullable = super_admin)

notification_templates ──── notification_logs (by template_code)
categories ──── products
```

## Tabel

### Auth & Role
| Tabel | Kolom penting | Catatan |
|---|---|---|
| `customers` | id, phone, email, full_name, is_verified | Login OTP, tanpa password |
| `otp_codes` | target, channel, code, purpose, expires_at, consumed_at | Expire 5 menit |
| `staff_users` | id, email, role, outlet_id, **password_hash**, sso_provider, sso_subject, is_active | `role`: super_admin (outlet_id null) \| outlet_admin. `password_hash` NULLABLE — null = SSO-only. Bisa login lewat SSO ATAU password, dua-duanya menghasilkan JWT sama shape. |

### Outlet & Menu
| Tabel | Kolom penting | Catatan |
|---|---|---|
| `outlets` | id, name, address, open_hour, close_hour, is_open, latitude, longitude | |
| `categories` | id, name, group_name | |
| `products` | id, category_id, name, base_price, description, rating, is_bestseller, is_new | Master GLOBAL |
| `product_addons` | id, product_id, name, extra_price, is_popular | |
| `product_outlets` | id, product_id, outlet_id, is_available, price_override, stock_note | **Kunci poin 1** — unique(product_id, outlet_id) |

### Order
| Tabel | Kolom penting | Catatan |
|---|---|---|
| `orders` | id, order_number, customer_id, outlet_id, fulfillment_type, delivery_address, payment_method_id, subtotal, **discount**, voucher_id, service_fee, total, payment_status, order_status, paid_at | Parent |
| `order_details` | id, order_id, product_id, product_name_snapshot, qty, size, temperature, sugar, ice, unit_price, addons (jsonb) | Child, snapshot harga |
| `order_status_logs` | id, order_id, status, changed_by_staff_id, changed_at | |
| `outlet_order_alerts` | id, outlet_id, order_id, is_acknowledged | Poin 3 |

### Payment
| Tabel | Kolom penting | Catatan |
|---|---|---|
| `payment_methods` | id, code, display_name, provider, is_active, outlet_id | outlet_id null = global |
| `payment_logs` | id, order_id, direction, provider, payload (jsonb), http_status | direction: request\|response\|webhook |

### Voucher & Loyalty
| Tabel | Kolom penting | Catatan |
|---|---|---|
| `vouchers` | id, name, description, code, discount_type, discount_value, max_discount, min_purchase, valid_from/until, usage_limit, is_active | name: nama/judul voucher (misal: "Promo Kemerdekaan 20%") |

| `customer_vouchers` | customer_id, voucher_id, claimed_at, used_at | unique(customer_id, voucher_id) |
| `loyalty_tiers` | id, name, min_points, min_orders, sort_order | |
| `customer_loyalty` | customer_id (PK), points, total_orders, tier_id, updated_at | 1 baris per customer |
| `point_transactions` | id, customer_id, order_id, points_change, reason | Histori/audit |
| `rewards` / `reward_redemptions` | point_cost / redeemed_at | |

### Notifikasi
| Tabel | Kolom penting | Catatan |
|---|---|---|
| `notification_templates` | id, code, channel, subject, body_template, is_active | Placeholder `{{var}}` |
| `notification_logs` | id, template_code, order_id, customer_id, channel, target, payload, response, status | Poin 19 |

### Pelengkap Mobile
| Tabel | Kolom penting |
|---|---|
| `favorites` | customer_id, product_id (unique) |
| `addresses` | customer_id, label, recipient, full_address, is_default |

## Query menu per outlet (contoh)
```sql
select p.*, po.is_available, coalesce(po.price_override, p.base_price) as price
from products p
join product_outlets po on po.product_id = p.id
where po.outlet_id = $1 and po.is_available = true;
```

## Query login staff via password (contoh)
```sql
select * from staff_users where email = $1 and is_active = true limit 1;
-- lalu bcrypt.compare(password, row.password_hash) di kode, bukan di SQL
```
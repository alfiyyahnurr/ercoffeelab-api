# Todo — ERCoffeeLab Backend API

Urutan pengerjaan disarankan top-to-bottom. Centang kalau selesai & sudah dites manual (curl).

## ✅ Selesai
- [x] Schema Neon lengkap (`src/db/schema.ts`) + migration jalan (`db:push`)
- [x] Seed dummy data (`src/db/seed.ts`) — termasuk akun demo password
- [x] `lib/jwt.ts`, `lib/auth-middleware.ts`
- [x] `POST /api/auth/otp/request`, `POST /api/auth/otp/verify`
- [x] `GET /api/auth/session`
- [x] `GET /api/auth/sso/google`, `GET /api/auth/sso/callback`
- [x] `POST /api/auth/staff/login` (email+password, akun demo)
- [x] `GET /api/health`

## ⬜ Outlet & Menu
- [x] `GET /api/outlets` (publik)
- [x] `POST /api/outlets` (super_admin)
- [x] `PATCH /api/outlets/:id` (super_admin)
- [x] `GET /api/outlets/:id/menu` (publik, HANYA is_available=true)
- [x] `GET /api/outlets/:id/alerts?unacknowledged=true` (staff, scoped outlet)
- [x] `PATCH /api/outlets/:id/alerts/:alertId`


## ⬜ Products
- [x] `GET /api/products`, `POST`, `PATCH /:id`, `DELETE /:id` (super_admin)
- [x] `PATCH /api/products/:id/outlets` (toggle is_available + price_override per outlet)


## ⬜ Orders
- [x] `POST /api/orders` — **hitung ulang harga di server**, insert parent+child+alert
- [x] `GET /api/orders` (scoped: customer→miliknya, outlet_admin→outletnya, super_admin→semua)
- [x] `GET /api/orders/:id`
- [x] `PATCH /api/orders/:id/status` — insert ke order_status_logs juga


## ⬜ Payment
- [x] `GET /api/payment-methods` (publik, hanya aktif) + versi admin (semua)
- [x] `POST /api/payment-methods`, `PATCH /:id` (super_admin)

- [x] `POST /api/payments/midtrans/charge` — real, ke Midtrans sandbox, catat payment_logs
- [x] `POST /api/webhooks/midtrans` — verifikasi signature, update order, trigger loyalty+notif
- [x] `POST /api/payments/midtrans/simulate` — **dev-only**, simulasi tanpa perlu akun Midtrans sungguhan
- [x] `lib/midtrans.ts`, `lib/loyalty.ts`, `lib/notifications.ts` (stub, Fontee beneran di Fase 5)

## ⬜ Voucher
- [x] `GET /api/vouchers` (admin), `GET /api/vouchers/active` (mobile)
- [x] `POST /api/vouchers`, `PATCH /:id` (super_admin)
- [x] `POST /api/vouchers/validate`


## ⬜ Customer & Loyalty
- [x] `GET /api/customers`, `GET /api/customers/:id`
- [x] `GET /api/customers/:id/loyalty`
- [x] `GET/POST/PATCH /api/loyalty-tiers`
- [x] `lib/loyalty.ts` — `recalculateLoyaltyTier()`
- [x] `GET/POST /api/rewards`, `POST /api/rewards/:id/redeem`


## ⬜ Notifikasi
- [x] `GET/POST/PATCH/DELETE /api/notification-templates` (super_admin)
- [x] `lib/notifications.ts` — `sendNotification()` (stub)
- [x] `GET /api/notification-logs`


## ⬜ Staff Management
- [x] `GET/POST/PATCH /api/staff-users` (super_admin) — `POST` terima field opsional `password` (di-hash bcrypt kalau diisi, kalau kosong berarti SSO-only)


## Referensi wajib dibaca sebelum ngerjain tiap bagian
- `prd.md` — requirement per fitur
- `erd.md` — struktur tabel & relasi
- `architecture.md` — pola kode & auth flow
- `navigation-flow.md` — urutan sequence tiap alur (checkout, webhook, dsb)
- `design-system.md` — konvensi response/error/naming
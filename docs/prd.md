# PRD — ERCoffeeLab Backend API

## 1. Tujuan
Backend tunggal (Next.js API Routes) yang melayani dua consumer: **Admin Panel** (Next.js, role super_admin/outlet_admin) dan **Mobile App** (Expo, pelanggan). Menggantikan Supabase sepenuhnya — database di Neon Postgres, auth custom, tanpa RLS (otorisasi dicek manual di kode).

## 2. Prinsip Teknis (wajib diikuti)
- **Query layer pakai raw SQL** lewat `@neondatabase/serverless` (tagged template `sql\`...\``), BUKAN ORM query builder saat runtime.
- **Drizzle ORM dipakai HANYA untuk migration (`db:push`/`db:generate`) dan seed.**
- Semua route ada di `app/api/**/route.ts` (Next.js App Router).
- Auth pakai JWT (`jose`), tanpa session/cookie server-side di backend, tanpa RLS.
- Staff admin punya **2 jalur login**: SSO Google ATAU email+password (lihat poin 17 di bawah). Customer mobile pakai OTP.
- Tidak ada RLS — setiap route yang butuh scoping data HARUS filter manual di query pakai `WHERE outlet_id = ...` dari payload JWT.

## 3. Requirement Fungsional

| # | Requirement | Implementasi |
|---|---|---|
| 1 | Menu berbeda per outlet | Tabel `product_outlets` (is_available, price_override per outlet). |
| 2 | Order per outlet | `orders.outlet_id` wajib diisi tiap order. |
| 3 | Alert notif pesanan masuk per outlet | Tabel `outlet_order_alerts`, endpoint polling. |
| 4 | Status pickup vs delivery beda | `orders.fulfillment_type` ('pickup'\|'delivery'). |
| 5 | Payment method on/off | `payment_methods.is_active`, toggle per outlet atau global. |
| 6 | Voucher (customer ↔ order one-to-many) | `orders.voucher_id` + `customer_vouchers` untuk tracking klaim. |
| 7 | Data pelanggan utk hitung loyalty | Tabel `customers` + `customer_loyalty`. |
| 8 | Tier member otomatis | Recalculate tiap `orders.payment_status` → 'paid'. |
| 9 | Order parent/child | `orders` (parent) + `order_details` (child). |
| 10 | Diskon di parent | `orders.discount`. |
| 11 | Status paid/checkout + kirim notif | `orders.payment_status`, trigger notifikasi saat jadi 'paid'. |
| 12 | Payment gateway Midtrans | `POST /api/payments/midtrans/charge` (real, ke SANDBOX Midtrans) + `POST /api/webhooks/midtrans` (callback asli, verifikasi signature) + `POST /api/payments/midtrans/simulate` (dev-only, bypass Midtrans sepenuhnya — untuk testing/demo tanpa perlu akun sandbox/ngrok). Ketiganya update `orders`+trigger loyalty+notifikasi dengan logika sama. |
| 13 | CRUD template notifikasi | `notification_templates` full CRUD. |
| 16 | Role super_admin & outlet_admin | `staff_users.role` + `outlet_id`. |
| 17 | **Login admin: SSO ATAU email+password** | `staff_users.password_hash` (nullable — null berarti akun itu SSO-only). Dua endpoint terpisah: `/api/auth/sso/*` dan `/api/auth/staff/login`. Password dipakai untuk **akun demo** (bukan email asli), jadi bisa login tanpa setup Google OAuth. |
| 18 | OTP login mobile | Deteksi customer baru vs lama otomatis. |
| 19 | Payment log & notif log per order | `payment_logs`, `notification_logs` — payload+response jsonb. |
| 20-21 | Neon Postgres, Next.js API Route, Drizzle migrate+seed, raw query | Prinsip arsitektur di atas. |

## 4. Sudah dibuat
- Schema lengkap, seed (termasuk 2 akun demo dengan password — lihat `erd.md`)
- Auth: OTP customer, SSO Google staff, **login email+password staff**, session, JWT + role middleware

## 5. Belum dibuat
Lihat `todo.md` untuk checklist lengkap per endpoint.

## 6. Non-goals
- Realtime WebSocket — polling dulu
- Multi-currency/multi-language
- Refund/void payment flow
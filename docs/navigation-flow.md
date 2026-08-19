# Navigation Flow — ERCoffeeLab Backend API

Untuk backend, "navigation flow" berarti **alur data/request antar sistem** (bukan navigasi halaman). Berikut sequence penting yang harus diimplementasikan persis urutannya.

## 1. Login Staff — dua jalur, hasil sama

```
Jalur SSO:
Admin Panel → GET /api/auth/sso/google → redirect Google
  Google → user pilih akun → redirect GET /api/auth/sso/callback?code=...
  Backend: tukar code→access_token → ambil email dari Google
  → cek staff_users WHERE email=... AND is_active=true
  → kalau ada: JWT{type:staff,role,outletId} → redirect ADMIN_PANEL_URL/sso-callback?token=...
  → kalau tidak ada: redirect ADMIN_PANEL_URL/login?error=not_registered

Jalur Password (demo):
Admin Panel → POST /api/auth/staff/login {email, password}
  Backend: cek staff_users WHERE email=... AND is_active=true
  → kalau password_hash null: reject "hanya bisa SSO"
  → bcrypt.compare(password, password_hash)
  → valid: JWT{type:staff,role,outletId} (response langsung, bukan redirect)
  → invalid: 401 "Email atau password salah"
```

## 2. Checkout & Bayar (mobile)

```
Mobile: pilih outlet → GET /api/outlets/:id/menu (hanya is_available=true)
Mobile: susun cart lokal → POST /api/vouchers/validate {code, subtotal} (opsional)
Mobile: POST /api/orders {outletId, fulfillmentType, items, paymentMethodId, voucherCode?}
  Backend: hitung ulang subtotal+discount+total DARI DATABASE (jangan percaya client)
  → insert orders (payment_status=unpaid, order_status=checkout) + order_details
  → insert outlet_order_alerts (trigger alert admin poin 3)
  → return orderId

Mobile: POST /api/payments/midtrans/charge {orderId}
  Backend: panggil Midtrans Snap API → catat payment_logs(direction=request lalu response)
  → return snap_token/redirect_url
Mobile: buka WebView Midtrans dengan snap_token

Midtrans: user bayar → callback ke POST /api/webhooks/midtrans
  Backend: verifikasi signature key
  → catat payment_logs(direction=webhook)
  → kalau settlement/capture: update orders.payment_status=paid, paid_at=now()
  → panggil recalculateLoyaltyTier(customerId)
  → panggil sendNotification('order_paid', customer, {orderNumber,...})
```

## 3. Update Status Order (admin)

```
Admin Panel: PATCH /api/orders/:id/status {status: 'preparing'}
  Backend: requireStaff() → kalau outlet_admin, WAJIB cek order.outlet_id === payload.outletId dulu
  → update orders.order_status
  → insert order_status_logs {status, changed_by_staff_id}
  (opsional, bisa trigger notifikasi juga kalau status='ready' dsb — lihat notification_templates)
```

## 4. Kirim Notifikasi (generic, dipanggil dari berbagai event)

```
Trigger manapun (webhook paid, ulang tahun via cron nanti, dll)
  → sendNotification(templateCode, target, variables, {orderId?, customerId?})
    1. Ambil template dari notification_templates WHERE code=templateCode AND is_active=true
    2. Render body_template, ganti {{var}} dengan values
    3. Panggil Fontee API (WA) atau email provider
    4. Insert notification_logs {payload, response, status}
```

## 5. Tier Loyalty Otomatis

```
recalculateLoyaltyTier(customerId) — dipanggil setelah order jadi 'paid'
  1. Hitung points earned dari order ini (mis. 1 poin per Rp10.000 dari total) → insert point_transactions
  2. Update customer_loyalty: points += earned, total_orders += 1
  3. Query loyalty_tiers ORDER BY sort_order DESC WHERE min_points <= customer.points AND min_orders <= customer.total_orders LIMIT 1
  4. Update customer_loyalty.tier_id
```

## 6. Setup & Testing Midtrans Sandbox

### Dapatkan API key sandbox
1. Daftar di dashboard.sandbox.midtrans.com (akun sandbox terpisah dari production)
2. Settings → Access Keys → copy **Server Key** dan **Client Key** (yang awalannya `SB-Mid-server-...` dan `SB-Mid-client-...`)
3. Isi ke `.env`: `MIDTRANS_SERVER_KEY`, `MIDTRANS_CLIENT_KEY`, `MIDTRANS_IS_PRODUCTION=false`

### Dua cara testing (pilih sesuai kebutuhan)

**A. Simulasi lokal (`POST /api/payments/midtrans/simulate`) — TIDAK butuh akun Midtrans:**
```bash
curl -X POST http://localhost:3000/api/payments/midtrans/simulate \
  -H "Content-Type: application/json" \
  -d '{"orderId":"<id-order>","result":"success"}'
```
Langsung update `orders.payment_status=paid`, jalankan loyalty+notifikasi — cocok buat develop fitur lain tanpa terhambat setup Midtrans, atau buat demo cepat. **Dinonaktifkan otomatis di production.**

**B. Sandbox Midtrans beneran (`POST /api/payments/midtrans/charge` + webhook asli):**
1. Isi `MIDTRANS_SERVER_KEY` dengan key sandbox asli
2. Karena webhook Midtrans butuh URL publik (tidak bisa ke `localhost` langsung), pakai tunnel: `npx ngrok http 3000` → dapat URL publik sementara
3. Set "Payment Notification URL" di dashboard.sandbox.midtrans.com ke `https://<url-ngrok>/api/webhooks/midtrans`
4. Panggil `/api/payments/midtrans/charge` dari mobile app → dapat `redirectUrl` → buka di WebView/browser
5. Di halaman Snap sandbox, **pakai data dummy resmi Midtrans** untuk simulasi bayar:
   - Kartu kredit test: nomor `4811 1111 1111 1114`, CVV `123`, expiry bebas tanggal masa depan, OTP `112233`
   - GoPay/QRIS sandbox: ada tombol "Simulate Payment Success" langsung di halaman Snap sandbox
   - Daftar lengkap & terbaru: lihat dokumentasi resmi Midtrans (`docs.midtrans.com` → "Testing" / "Simulator")
6. Setelah bayar, Midtrans kirim webhook ke URL ngrok kamu → cek `payment_logs` untuk lihat payload masuk
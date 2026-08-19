# Design System — ERCoffeeLab Backend API Conventions

Backend tidak punya UI, jadi "design system" di sini berarti **konvensi desain API** — supaya semua endpoint (dibuat kapanpun, oleh siapapun/AI manapun) konsisten dan gampang dipakai admin/mobile.

## Format Response

**Sukses — single resource:**
```json
{ "id": "...", "name": "...", "createdAt": "..." }
```

**Sukses — list resource:**
```json
{ "data": [ { ... }, { ... } ] }
```
(tambahkan `"pagination": {"page":1,"pageSize":20,"total":57}` kalau endpoint butuh pagination — belum wajib di awal)

**Error:**
```json
{ "error": "Pesan singkat dan jelas dalam Bahasa Indonesia" }
```
HTTP status yang dipakai konsisten: `400` (input salah), `401` (belum login), `403` (tidak punya akses), `404` (tidak ketemu), `409` (konflik, mis. kode voucher dobel), `500` (error server).

## Penamaan field
- Kolom database `snake_case` → response API **WAJIB `camelCase`** (`outlet_id` → `outletId`). Ini berarti route handler harus transform manual sebelum `NextResponse.json(...)` (raw SQL return snake_case apa adanya).
- Nama field boolean pakai awalan `is`/`has` (`isAvailable`, `isActive`, `hasVoucher`).
- Uang dalam **integer rupiah tanpa desimal** (mis. `20000` = Rp20.000), bukan float.
- Tanggal/waktu format ISO 8601 string (`"2026-08-17T10:00:00.000Z"`).

## Auth header
Semua endpoint yang butuh login: `Authorization: Bearer <jwt>`. Tidak pakai cookie di level backend (cookie httpOnly itu urusan admin panel Next.js sendiri saat proxy ke backend).

## Query parameter
- Filter: `?outletId=...&status=...`
- Search: `?search=...`
- Pagination (kalau dipakai): `?page=1&pageSize=20`

## Validasi input
- Validasi field wajib manual di tiap route (contoh sudah ada di `otp/request/route.ts`) — tidak pakai library validasi tambahan (zod dll) di awal supaya tetap ringan, boleh ditambah belakangan kalau makin kompleks.
- Selalu return `400` dengan pesan spesifik field mana yang salah, bukan pesan generik.

## Penamaan endpoint
- Plural untuk resource: `/api/orders`, `/api/products` (bukan `/order`, `/product`)
- Nested resource pakai path, bukan query: `/api/outlets/:id/menu` (bukan `/api/menu?outletId=`)
- Action non-CRUD pakai verb di akhir path: `/api/vouchers/validate`, `/api/rewards/:id/redeem`

## Logging
Semua panggilan ke third-party (Midtrans, Fontee) WAJIB dicatat ke `payment_logs`/`notification_logs` — request DAN response, termasuk kalau error (poin 19). Jangan pernah skip logging "karena buru-buru".
# ercoffeelab-api — Fase 1: Setup Neon + Schema

## Yang sudah disiapkan
- `src/db/schema.ts` — semua tabel (outlet, produk per-outlet, order parent/child, voucher, loyalty tier, payment log, notification log, staff role, dll) sesuai rancangan sistem v2.
- `src/db/client.ts` — koneksi raw SQL (`sql` tagged template) yang nanti dipakai di semua API route Fase 2+.
- `src/db/seed.ts` — data dummy: 2 outlet, 3 produk (Americano cuma tersedia di outlet Bandung), payment methods, 1 super_admin + 1 outlet_admin, 4 loyalty tier, 2 notification template.
- `drizzle.config.ts` — konfigurasi migration.

## Cara jalanin (Fase 1)

1. **Isi `.env`**
   Buka file `.env`, ganti `DATABASE_URL` dengan connection string dari Neon Dashboard (pastikan pakai yang "pooled connection").

2. **Install dependency**
   ```bash
   npm install
   ```

3. **Push schema ke Neon**
   Perintah ini otomatis bikin semua tabel di database Neon kamu sesuai `schema.ts` (tanpa perlu nulis migration SQL manual):
   ```bash
   npm run db:push
   ```
   Kalau ada prompt konfirmasi perubahan, ketik `y` / pilih "Yes, I want to execute all statements".

4. **Isi data dummy**
   ```bash
   npm run db:seed
   ```

5. **Verifikasi**
   Buka Neon SQL Editor di dashboard, jalankan:
   ```sql
   select * from outlets;
   select p.name, o.name as outlet, po.is_available
   from product_outlets po
   join products p on p.id = po.product_id
   join outlets o on o.id = po.outlet_id;
   ```
   Amerocano seharusnya `is_available = false` di outlet Jakarta.

   Atau pakai GUI lokal:
   ```bash
   npm run db:studio
   ```
   (buka browser ke URL yang muncul di terminal, bisa lihat & edit semua tabel)

## Setelah Fase 1 selesai
Lanjut ke **Fase 2**: bikin project Next.js di sebelah folder ini yang mengimpor `sql` dari `src/db/client.ts` untuk API routes (auth OTP, auth SSO staff, dst).

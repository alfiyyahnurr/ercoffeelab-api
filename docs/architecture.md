# Architecture — ERCoffeeLab Backend API

## Stack
- **Framework**: Next.js 15 (App Router), deploy sebagai Vercel Serverless Functions
- **Database**: Neon Postgres (pooled connection)
- **Query layer**: raw SQL via `@neondatabase/serverless`
- **Migration & seed**: Drizzle Kit — TIDAK dipakai untuk query runtime
- **Auth**: JWT custom (`jose`) — 3 jalur masuk: OTP (customer), SSO Google (staff), email+password (staff, demo)
- **Password hashing**: `bcryptjs`
- **Payment**: Midtrans (Snap API)
- **Notifikasi WA/Email**: Fontee

## Struktur folder
```
apps/api/
├── app/api/
│   ├── auth/
│   │   ├── otp/request/route.ts, verify/route.ts
│   │   ├── session/route.ts
│   │   ├── sso/google/route.ts, callback/route.ts
│   │   └── staff/login/route.ts          ← email+password (baru)
│   ├── outlets/, products/, orders/, payment-methods/, payments/, webhooks/,
│   │   vouchers/, customers/, loyalty-tiers/, notification-templates/,
│   │   staff-users/, rewards/, health/
│   └── layout.tsx, page.tsx
├── lib/
│   ├── jwt.ts, auth-middleware.ts        ← ada
│   ├── loyalty.ts                         ← BUAT: recalculateLoyaltyTier()
│   ├── notifications.ts                   ← BUAT: sendNotification()
│   └── midtrans.ts                        ← BUAT: wrapper Midtrans
├── src/db/
│   ├── schema.ts, client.ts, seed.ts
└── docs/
```

## Pola route handler
```ts
import { NextResponse } from "next/server";
import { sql } from "@/src/db/client";
import { requireStaff } from "@/lib/auth-middleware";

export async function GET(req: Request, { params }: { params: { id: string } }) {
  const auth = await requireStaff(req);
  if ("error" in auth) return auth.error;

  const rows = auth.payload.role === "outlet_admin"
    ? await sql`select * from orders where id = ${params.id} and outlet_id = ${auth.payload.outletId}`
    : await sql`select * from orders where id = ${params.id}`;

  if (!rows[0]) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(rows[0]);
}
```

**Aturan konsisten:**
1. Selalu pakai `requireCustomer`/`requireStaff` — jangan bikin cara auth baru.
2. Outlet_admin SELALU difilter `outlet_id` di WHERE clause.
3. Error konsisten: `{ error: string }` + HTTP status sesuai.
4. Sukses: object langsung (single) / `{ data: [...] }` (list).
5. Semua interaksi Midtrans/Fontee dicatat ke `payment_logs`/`notification_logs`.

## Auth flow

**Customer (mobile) — OTP:**
1. `POST /api/auth/otp/request` → OTP
2. `POST /api/auth/otp/verify` → JWT `{ type: "customer" }`

**Staff (admin) — jalur A: SSO Google:**
1. `GET /api/auth/sso/google` → redirect Google
2. `GET /api/auth/sso/callback` → cek email ada di `staff_users` → JWT `{ type: "staff", role, outletId }`

**Staff (admin) — jalur B: Email + Password (demo):**
1. `POST /api/auth/staff/login` `{ email, password }` → cek `password_hash` (bcrypt compare) → JWT sama seperti jalur SSO
2. Dipakai untuk akun demo (bukan email asli) — supaya reviewer/tester bisa login tanpa setup Google OAuth
3. Staff yang `password_hash`-nya `null` hanya bisa lewat SSO — endpoint ini reject dengan pesan jelas

Kedua jalur menghasilkan JWT dengan shape sama persis (`type: "staff", role, outletId`) — admin panel tidak perlu tahu/peduli staff login lewat jalur mana.

## Environment variables
Lihat `.env.example`. Tambahan untuk fitur password:
- Tidak ada env baru — `password_hash` di-generate lewat `bcrypt.hash()` saat seed atau saat `POST /api/staff-users` (endpoint ini nanti terima field opsional `password`, kalau diisi berarti staff itu boleh login password juga).

## Deploy
Vercel, root directory `apps/api`. Detail: `docs/deployment.md` di root monorepo.
import { NextResponse } from "next/server";
import { sql } from "@/src/db/client";
import { signToken } from "@/lib/jwt";

/**
 * POST /api/auth/otp/verify
 * body: { target: string, code: string }
 *
 * Verifikasi OTP. Kalau customer belum ada, otomatis dibuat (register).
 * Return JWT + data customer.
 */
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const target = body?.target?.trim();
  const code = body?.code?.trim();

  if (!target || !code) {
    return NextResponse.json({ error: "target dan code wajib diisi" }, { status: 400 });
  }

  const rows = await sql`
    select id, expires_at, consumed_at from otp_codes
    where target = ${target} and code = ${code}
    order by created_at desc
    limit 1
  `;
  const otp = rows[0];

  if (!otp) {
    return NextResponse.json({ error: "Kode OTP salah" }, { status: 400 });
  }
  if (otp.consumed_at) {
    return NextResponse.json({ error: "Kode OTP sudah dipakai" }, { status: 400 });
  }
  if (new Date(otp.expires_at) < new Date()) {
    return NextResponse.json({ error: "Kode OTP sudah kedaluwarsa" }, { status: 400 });
  }

  await sql`update otp_codes set consumed_at = now() where id = ${otp.id}`;

  // Cari atau bikin customer (poin 18: identifikasi lama/baru)
  const isEmail = target.includes("@");
  const existing = isEmail
    ? await sql`select * from customers where email = ${target} limit 1`
    : await sql`select * from customers where phone = ${target} limit 1`;

  let customer = existing[0];
  if (!customer) {
    const inserted = isEmail
      ? await sql`insert into customers (email, is_verified) values (${target}, true) returning *`
      : await sql`insert into customers (phone, is_verified) values (${target}, true) returning *`;
    customer = inserted[0];

    // Inisialisasi loyalty account customer baru
    await sql`insert into customer_loyalty (customer_id, points, total_orders) values (${customer.id}, 0, 0)`;
  } else if (!customer.is_verified) {
    await sql`update customers set is_verified = true where id = ${customer.id}`;
  }

  const token = await signToken({ sub: customer.id, type: "customer" });

  return NextResponse.json({
    token,
    customer: {
      id: customer.id,
      email: customer.email,
      phone: customer.phone,
      fullName: customer.full_name,
    },
  });
}

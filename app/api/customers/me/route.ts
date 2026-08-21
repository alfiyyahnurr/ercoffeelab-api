import { NextResponse } from "next/server";
import { sql } from "@/src/db/client";
import { requireCustomer } from "@/lib/auth-middleware";

function formatCustomer(row: any) {
  return {
    id: Number(row.id),
    phone: row.phone ?? null,
    email: row.email ?? null,
    fullName: row.full_name ?? null,
    gender: row.gender ?? null,
    birthDate: row.birth_date ?? null,
    isVerified: Boolean(row.is_verified),
    createdAt: row.created_at,
  };
}

/**
 * GET /api/customers/me
 * Header: Authorization: Bearer <token>
 * Customer only — Mengambil detail profil customer yang sedang login.
 */
export async function GET(req: Request) {
  const auth = await requireCustomer(req);
  if ("error" in auth) return auth.error;

  const customerId = auth.payload.sub;

  const rows = await sql`
    SELECT id, phone, email, full_name, gender, birth_date, is_verified, created_at
    FROM customers
    WHERE id = ${customerId}
    LIMIT 1
  `;

  if (!rows[0]) {
    return NextResponse.json({ error: "Customer tidak ditemukan" }, { status: 404 });
  }

  return NextResponse.json({
    customer: formatCustomer(rows[0]),
  });
}

/**
 * PATCH /api/customers/me
 * Header: Authorization: Bearer <token>
 * Customer only — Update profil customer (Nama Lengkap, Email, Phone, Gender, Birth Date).
 */
export async function PATCH(req: Request) {
  const auth = await requireCustomer(req);
  if ("error" in auth) return auth.error;

  const customerId = auth.payload.sub;
  const body = await req.json().catch(() => null);

  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Body request tidak valid" }, { status: 400 });
  }

  const { fullName, email, phone, gender, birthDate } = body;

  // Cek duplikasi email jika diisi
  if (email && typeof email === "string" && email.trim()) {
    const trimmedEmail = email.trim().toLowerCase();
    const existing = await sql`
      SELECT id FROM customers WHERE LOWER(email) = ${trimmedEmail} AND id != ${customerId} LIMIT 1
    `;
    if (existing.length > 0) {
      return NextResponse.json({ error: "Email sudah digunakan oleh akun lain" }, { status: 400 });
    }
  }

  // Cek duplikasi phone jika diisi
  if (phone && typeof phone === "string" && phone.trim()) {
    const trimmedPhone = phone.trim();
    const existing = await sql`
      SELECT id FROM customers WHERE phone = ${trimmedPhone} AND id != ${customerId} LIMIT 1
    `;
    if (existing.length > 0) {
      return NextResponse.json({ error: "Nomor telepon sudah digunakan oleh akun lain" }, { status: 400 });
    }
  }

  const updatedRows = await sql`
    UPDATE customers
    SET 
      full_name = ${fullName !== undefined ? (fullName ? String(fullName).trim() : null) : sql`full_name`},
      email = ${email !== undefined ? (email ? String(email).trim().toLowerCase() : null) : sql`email`},
      phone = ${phone !== undefined ? (phone ? String(phone).trim() : null) : sql`phone`},
      gender = ${gender !== undefined ? (gender ? String(gender).trim() : null) : sql`gender`},
      birth_date = ${birthDate !== undefined ? (birthDate ? String(birthDate).trim() : null) : sql`birth_date`}
    WHERE id = ${customerId}
    RETURNING id, phone, email, full_name, gender, birth_date, is_verified, created_at
  `;

  if (updatedRows.length === 0) {
    return NextResponse.json({ error: "Customer tidak ditemukan" }, { status: 404 });
  }

  return NextResponse.json({
    message: "Profil berhasil diperbarui",
    customer: formatCustomer(updatedRows[0]),
  });
}

/**
 * DELETE /api/customers/me
 * Header: Authorization: Bearer <token>
 * Customer only — Menghapus akun customer yang sedang login secara permanen dari database Neon Postgres.
 */
export async function DELETE(req: Request) {
  const auth = await requireCustomer(req);
  if ("error" in auth) return auth.error;

  const customerId = auth.payload.sub;

  const existing = await sql`SELECT id FROM customers WHERE id = ${customerId} LIMIT 1`;
  if (!existing[0]) {
    return NextResponse.json({ error: "Customer tidak ditemukan" }, { status: 404 });
  }

  // Cascade delete child records to avoid foreign key and not-null constraint 500 errors
  await sql`
    DELETE FROM order_details 
    WHERE order_id IN (SELECT id FROM orders WHERE customer_id = ${customerId})
  `;
  await sql`
    DELETE FROM order_status_logs 
    WHERE order_id IN (SELECT id FROM orders WHERE customer_id = ${customerId})
  `;
  await sql`
    DELETE FROM outlet_order_alerts 
    WHERE order_id IN (SELECT id FROM orders WHERE customer_id = ${customerId})
  `;

  await sql`DELETE FROM orders WHERE customer_id = ${customerId}`;
  await sql`DELETE FROM favorites WHERE customer_id = ${customerId}`;
  await sql`DELETE FROM customer_vouchers WHERE customer_id = ${customerId}`;
  await sql`DELETE FROM customer_loyalty WHERE customer_id = ${customerId}`;
  await sql`DELETE FROM addresses WHERE customer_id = ${customerId}`;
  await sql`DELETE FROM point_transactions WHERE customer_id = ${customerId}`;
  await sql`DELETE FROM reward_redemptions WHERE customer_id = ${customerId}`;
  await sql`DELETE FROM notification_logs WHERE customer_id = ${customerId}`;

  // Delete customer record from Neon Postgres
  await sql`DELETE FROM customers WHERE id = ${customerId}`;

  return NextResponse.json({
    message: "Akun berhasil dihapus secara permanen",
  });
}

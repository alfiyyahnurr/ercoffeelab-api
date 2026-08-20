import { NextResponse } from "next/server";
import crypto from "crypto";
import { sql } from "@/src/db/client";
import { requireCustomer } from "@/lib/auth-middleware";

/**
 * Hash PIN 6-digit menggunakan SHA-256 dengan salt rahasia
 */
export function hashPin(pin: string): string {
  const secret = process.env.JWT_SECRET || "ercoffeelab-secret-key";
  return crypto.createHmac("sha256", secret).update(pin).digest("hex");
}

/**
 * POST /api/customers/pin
 * Header: Authorization: Bearer <token_customer>
 * Body: { pin: "123456" }
 *
 * Menyimpan / memperbarui PIN 6-digit keamanan pelanggan ke database Neon Postgres.
 */
export async function POST(req: Request) {
  const auth = await requireCustomer(req);
  if ("error" in auth) return auth.error;

  const customerId = auth.payload.sub;
  const body = await req.json().catch(() => null);
  const pin = body?.pin?.toString().trim();

  if (!pin || !/^\d{6}$/.test(pin)) {
    return NextResponse.json(
      { error: "PIN wajib berupa 6 digit angka (contoh: 123456)" },
      { status: 400 }
    );
  }

  const hashedPin = hashPin(pin);

  await sql`
    UPDATE customers 
    SET pin = ${hashedPin}, updated_at = NOW() 
    WHERE id = ${customerId}
  `;

  return NextResponse.json({
    message: "PIN keamanan berhasil disimpan",
    hasPin: true,
  });
}

/**
 * PUT /api/customers/pin (Verifikasi PIN)
 * Header: Authorization: Bearer <token_customer>
 * Body: { pin: "123456" }
 *
 * Memverifikasi apakah PIN yang dimasukkan pelanggan cocok dengan PIN di database.
 */
export async function PUT(req: Request) {
  const auth = await requireCustomer(req);
  if ("error" in auth) return auth.error;

  const customerId = auth.payload.sub;
  const body = await req.json().catch(() => null);
  const pin = body?.pin?.toString().trim();

  if (!pin || !/^\d{6}$/.test(pin)) {
    return NextResponse.json(
      { error: "PIN wajib berupa 6 digit angka" },
      { status: 400 }
    );
  }

  const rows = await sql`SELECT pin FROM customers WHERE id = ${customerId} LIMIT 1`;
  const storedPinHash = rows[0]?.pin;

  if (!storedPinHash) {
    return NextResponse.json(
      { error: "PIN keamanan belum dibuat untuk akun ini", hasPin: false },
      { status: 404 }
    );
  }

  const inputHash = hashPin(pin);
  if (inputHash !== storedPinHash) {
    return NextResponse.json(
      { error: "PIN keamanan yang Anda masukkan salah", valid: false },
      { status: 400 }
    );
  }

  return NextResponse.json({
    message: "PIN cocok",
    valid: true,
  });
}

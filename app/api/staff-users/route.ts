import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { sql } from "@/src/db/client";
import { requireStaff } from "@/lib/auth-middleware";
import { formatStaffUser } from "./utils";

/**
 * GET /api/staff-users
 * Super Admin only — Mengambil semua akun staf (tanpa password_hash).
 */
export async function GET(req: Request) {
  const auth = await requireStaff(req, ["super_admin"]);
  if ("error" in auth) return auth.error;

  const rows = await sql`
    SELECT 
      su.id,
      su.email,
      su.full_name,
      su.role,
      su.outlet_id,
      su.password_hash,
      su.is_active,
      su.created_at,
      o.name AS outlet_name
    FROM staff_users su
    LEFT JOIN outlets o ON o.id = su.outlet_id
    ORDER BY su.created_at DESC
  `;

  const data = rows.map(formatStaffUser);
  return NextResponse.json({ data });
}

/**
 * POST /api/staff-users
 * Super Admin only — Membuat akun staf baru.
 * Password opsional: jika diisi di-hash bcrypt, jika kosong password_hash = NULL (SSO-only).
 */
export async function POST(req: Request) {
  const auth = await requireStaff(req, ["super_admin"]);
  if ("error" in auth) return auth.error;

  const body = await req.json().catch(() => null);
  const email = body?.email?.trim()?.toLowerCase();
  const fullName = body?.fullName?.trim();
  const role = body?.role?.trim()?.toLowerCase();

  if (!email || !fullName || !role) {
    return NextResponse.json(
      { error: "email, fullName, dan role wajib diisi" },
      { status: 400 },
    );
  }

  if (!["super_admin", "outlet_admin"].includes(role)) {
    return NextResponse.json(
      { error: "role wajib 'super_admin' atau 'outlet_admin'" },
      { status: 400 },
    );
  }

  let outletId =
    body.outletId !== undefined && body.outletId !== null
      ? Number(body.outletId)
      : null;

  if (role === "outlet_admin") {
    if (!outletId || isNaN(outletId)) {
      return NextResponse.json(
        { error: "outletId wajib diisi untuk role outlet_admin" },
        { status: 400 },
      );
    }
  }

  if (outletId) {
    const outletCheck = await sql`SELECT id FROM outlets WHERE id = ${outletId}`;
    if (!outletCheck[0]) {
      return NextResponse.json({ error: "Outlet tidak ditemukan" }, { status: 404 });
    }
  }

  // Cek duplikasi email
  const dupCheck = await sql`
    SELECT id FROM staff_users WHERE LOWER(email) = ${email}
  `;
  if (dupCheck[0]) {
    return NextResponse.json(
      { error: "Email staff sudah terdaftar" },
      { status: 409 },
    );
  }

  // Hash password jika diisi, atau NULL jika kosong (SSO-only)
  let passwordHash: string | null = null;
  if (typeof body.password === "string" && body.password.trim().length > 0) {
    passwordHash = await bcrypt.hash(body.password.trim(), 10);
  }

  const insertedRows = await sql`
    INSERT INTO staff_users (
      email,
      full_name,
      role,
      outlet_id,
      password_hash,
      is_active
    )
    VALUES (
      ${email},
      ${fullName},
      ${role},
      ${outletId},
      ${passwordHash},
      true
    )
    RETURNING *
  `;

  // Ambil data join outlet name
  const staffRows = await sql`
    SELECT 
      su.id,
      su.email,
      su.full_name,
      su.role,
      su.outlet_id,
      su.password_hash,
      su.is_active,
      su.created_at,
      o.name AS outlet_name
    FROM staff_users su
    LEFT JOIN outlets o ON o.id = su.outlet_id
    WHERE su.id = ${insertedRows[0].id}
  `;

  return NextResponse.json(formatStaffUser(staffRows[0]), { status: 201 });
}

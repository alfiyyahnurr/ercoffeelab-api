import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { sql } from "@/src/db/client";
import { signToken } from "@/lib/jwt";

const SUPERADMIN_UNIQUE_CODE = "ERLAB-SA-2025";

/**
 * POST /api/auth/staff/register
 * Body: { fullName, email, password, role, outletId?, superadminCode? }
 */
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const fullName = body?.fullName?.trim();
  const email = body?.email?.trim()?.toLowerCase();
  const password = body?.password;
  const role = body?.role === "super_admin" ? "super_admin" : "outlet_admin";
  const outletId = body?.outletId ? Number(body.outletId) : null;
  const superadminCode = body?.superadminCode?.trim();

  if (!email || !password || !fullName) {
    return NextResponse.json(
      { error: "Nama lengkap, email, dan password wajib diisi" },
      { status: 400 }
    );
  }

  if (password.length < 6) {
    return NextResponse.json(
      { error: "Password minimal 6 karakter" },
      { status: 400 }
    );
  }

  if (role === "super_admin" && superadminCode !== SUPERADMIN_UNIQUE_CODE) {
    return NextResponse.json(
      { error: "Kode unik Super Admin tidak valid. Gunakan kode registrasi resmi." },
      { status: 400 }
    );
  }

  if (role === "outlet_admin" && !outletId) {
    return NextResponse.json(
      { error: "Cabang outlet wajib dipilih untuk pendaftaran Outlet Admin" },
      { status: 400 }
    );
  }

  // Validate outlet exists if outlet_admin
  if (role === "outlet_admin" && outletId) {
    const outletCheck = await sql`select id from outlets where id = ${outletId}`;
    if (!outletCheck[0]) {
      return NextResponse.json(
        { error: "Outlet cabang yang dipilih tidak ditemukan" },
        { status: 400 }
      );
    }
  }

  // Check if email already exists
  const existing = await sql`select id from staff_users where email = ${email} limit 1`;
  if (existing.length > 0) {
    return NextResponse.json(
      { error: "Email sudah terdaftar. Silakan gunakan email lain atau login." },
      { status: 400 }
    );
  }

  // Hash password
  const passwordHash = await bcrypt.hash(password, 10);
  const finalOutletId = role === "super_admin" ? null : outletId;

  // Insert new staff user
  const rows = await sql`
    insert into staff_users (email, full_name, role, outlet_id, password_hash, is_active)
    values (${email}, ${fullName}, ${role}, ${finalOutletId}, ${passwordHash}, true)
    returning id, email, full_name, role, outlet_id
  `;

  const staff = rows[0];

  const token = await signToken({
    sub: staff.id,
    type: "staff",
    role: staff.role,
    outletId: staff.outlet_id,
    fullName: staff.full_name,
    email: staff.email,
  });

  return NextResponse.json({
    token,
    staff: {
      id: staff.id,
      email: staff.email,
      fullName: staff.full_name,
      role: staff.role,
      outletId: staff.outlet_id,
    },
  });
}

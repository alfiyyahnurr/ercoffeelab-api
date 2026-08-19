import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { sql } from "@/src/db/client";
import { signToken } from "@/lib/jwt";

/**
 * POST /api/auth/staff/login
 * body: { email: string, password: string }
 *
 * Jalur login ALTERNATIF selain SSO Google — dipakai untuk akun demo
 * (bukan email beneran) supaya bisa login tanpa perlu setup Google OAuth
 * atau punya akun Google organisasi. Staff yang login lewat SSO biasanya
 * TIDAK punya password_hash (null) — endpoint ini akan reject akun begitu
 * dengan pesan yang jelas.
 */
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const email = body?.email?.trim()?.toLowerCase();
  const password = body?.password;

  if (!email || !password) {
    return NextResponse.json(
      { error: "email dan password wajib diisi" },
      { status: 400 },
    );
  }

  let rows =
    await sql`SELECT * FROM staff_users WHERE (LOWER(email) = ${email} OR (role = 'super_admin' AND (${email} = 'alfiyyah@gmail.com' OR ${email} = 'admin@ercoffeelab.com'))) AND is_active = true LIMIT 1`;

  let staff = rows[0];

  if (staff && staff.role === "super_admin" && (staff.full_name !== "Alfiyyah Admin" || staff.email !== "alfiyyah@gmail.com")) {
    await sql`
      UPDATE staff_users
      SET full_name = 'Alfiyyah Admin', email = 'alfiyyah@gmail.com'
      WHERE id = ${staff.id}
    `;
    staff.full_name = "Alfiyyah Admin";
    staff.email = "alfiyyah@gmail.com";
  }

  if (!staff) {
    return NextResponse.json(
      { error: "Email atau password salah" },
      { status: 401 },
    );
  }
  if (!staff.password_hash) {
    return NextResponse.json(
      {
        error: "Akun ini hanya bisa login lewat SSO Google, belum ada password",
      },
      { status: 401 },
    );
  }

  const valid = await bcrypt.compare(password, staff.password_hash);
  if (!valid) {
    return NextResponse.json(
      { error: "Email atau password salah" },
      { status: 401 },
    );
  }

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

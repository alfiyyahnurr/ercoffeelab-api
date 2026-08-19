import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { sql } from "@/src/db/client";
import { requireStaff } from "@/lib/auth-middleware";
import { formatStaffUser } from "../utils";

/**
 * PATCH /api/staff-users/:id
 * Super Admin only — Update data staf, role, outletId, status aktif, atau reset password.
 */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const targetId = Number(id);
  if (isNaN(targetId)) {
    return NextResponse.json({ error: "ID staff tidak valid" }, { status: 400 });
  }

  const auth = await requireStaff(req, ["super_admin"]);
  if ("error" in auth) return auth.error;

  const existingRows = await sql`
    SELECT * FROM staff_users WHERE id = ${targetId}
  `;
  const existing = existingRows[0];

  if (!existing) {
    return NextResponse.json({ error: "Staf tidak ditemukan" }, { status: 404 });
  }

  const body = await req.json().catch(() => null);
  if (!body || Object.keys(body).length === 0) {
    return NextResponse.json({ error: "Data update tidak boleh kosong" }, { status: 400 });
  }

  const fullName =
    body.fullName !== undefined
      ? String(body.fullName).trim()
      : existing.full_name;

  let role = existing.role;
  if (body.role !== undefined) {
    role = String(body.role).trim().toLowerCase();
    if (!["super_admin", "outlet_admin"].includes(role)) {
      return NextResponse.json(
        { error: "role wajib 'super_admin' atau 'outlet_admin'" },
        { status: 400 },
      );
    }
  }

  let outletId =
    body.outletId !== undefined
      ? body.outletId === null
        ? null
        : Number(body.outletId)
      : existing.outlet_id ? Number(existing.outlet_id) : null;

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

  let passwordHash = existing.password_hash;
  if (body.password !== undefined) {
    if (body.password === null) {
      passwordHash = null; // Clear password (convert to SSO-only)
    } else if (typeof body.password === "string" && body.password.trim().length > 0) {
      passwordHash = await bcrypt.hash(body.password.trim(), 10);
    }
  }

  const isActive =
    body.isActive !== undefined ? Boolean(body.isActive) : Boolean(existing.is_active);

  await sql`
    UPDATE staff_users
    SET
      full_name = ${fullName},
      role = ${role},
      outlet_id = ${outletId},
      password_hash = ${passwordHash},
      is_active = ${isActive}
    WHERE id = ${targetId}
  `;

  // Fetch updated staff with joined outlet name
  const updatedRows = await sql`
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
    WHERE su.id = ${targetId}
  `;

  return NextResponse.json(formatStaffUser(updatedRows[0]));
}

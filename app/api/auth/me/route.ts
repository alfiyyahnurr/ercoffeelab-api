import { NextResponse } from "next/server";
import { sql } from "@/src/db/client";
import { requireStaff } from "@/lib/auth-middleware";

/**
 * GET /api/auth/me
 * Returns fresh staff user details directly from database for the logged-in staff member.
 */
export async function GET(req: Request) {
  const auth = await requireStaff(req);
  if ("error" in auth) return auth.error;

  const staffId = auth.payload.sub;

  const rows = await sql`
    SELECT 
      su.id,
      su.email,
      su.full_name,
      su.role,
      su.outlet_id,
      su.is_active,
      o.name AS outlet_name
    FROM staff_users su
    LEFT JOIN outlets o ON o.id = su.outlet_id
    WHERE su.id = ${staffId} AND su.is_active = true
    LIMIT 1
  `;

  const staff = rows[0];
  if (!staff) {
    return NextResponse.json({ error: "Akun staf tidak ditemukan atau tidak aktif" }, { status: 404 });
  }

  return NextResponse.json({
    staff: {
      id: Number(staff.id),
      email: staff.email,
      fullName: staff.full_name,
      role: staff.role,
      outletId: staff.outlet_id ? Number(staff.outlet_id) : null,
      outletName: staff.outlet_name ?? null,
    },
  });
}

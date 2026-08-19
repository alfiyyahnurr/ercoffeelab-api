import { NextResponse } from "next/server";
import { sql } from "@/src/db/client";
import { getTokenFromRequest, type TokenPayload } from "@/lib/jwt";

/**
 * GET /api/auth/session
 * Header: Authorization: Bearer <token>
 * Mengembalikan data user yang sedang login (customer ATAU staff, tergantung token-nya).
 */
export async function GET(req: Request) {
  const payload = await getTokenFromRequest<TokenPayload>(req);
  if (!payload) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (payload.type === "customer") {
    const rows = await sql`select * from customers where id = ${payload.sub} limit 1`;
    if (!rows[0]) return NextResponse.json({ error: "Customer tidak ditemukan" }, { status: 404 });
    const c = rows[0];
    return NextResponse.json({
      type: "customer",
      customer: { id: c.id, email: c.email, phone: c.phone, fullName: c.full_name },
    });
  }

  const rows = await sql`select * from staff_users where id = ${payload.sub} limit 1`;
  if (!rows[0]) return NextResponse.json({ error: "Staff tidak ditemukan" }, { status: 404 });
  const s = rows[0];
  return NextResponse.json({
    type: "staff",
    staff: { id: s.id, email: s.email, fullName: s.full_name, role: s.role, outletId: s.outlet_id },
  });
}

import { NextResponse } from "next/server";
import { getTokenFromRequest, type CustomerTokenPayload, type StaffTokenPayload } from "./jwt";

/** Wajib login sebagai customer (mobile app). Return payload atau Response 401. */
export async function requireCustomer(
  req: Request,
): Promise<{ payload: CustomerTokenPayload } | { error: NextResponse }> {
  const payload = await getTokenFromRequest<CustomerTokenPayload>(req);
  if (!payload || payload.type !== "customer") {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  return { payload };
}

/**
 * Wajib login sebagai staff. `allowedRoles` kosong = semua role staff boleh.
 * Untuk outlet_admin, caller HARUS filter query berdasarkan payload.outletId sendiri
 * (menggantikan RLS lama) — cek contoh di route orders.
 */
export async function requireStaff(
  req: Request,
  allowedRoles: Array<"super_admin" | "outlet_admin"> = [],
): Promise<{ payload: StaffTokenPayload } | { error: NextResponse }> {
  const payload = await getTokenFromRequest<StaffTokenPayload>(req);
  if (!payload || payload.type !== "staff") {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  if (allowedRoles.length > 0 && !allowedRoles.includes(payload.role)) {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }
  return { payload };
}


export async function requireCustomerOrStaff(
  req: Request,
): Promise<
  | { payload: CustomerTokenPayload; userType: "customer" }
  | { payload: StaffTokenPayload; userType: "staff" }
  | { error: NextResponse }
> {
  const payload = await getTokenFromRequest(req);
  if (!payload) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  if (payload.type === "customer") {
    return { payload, userType: "customer" };
  }
  if (payload.type === "staff") {
    return { payload, userType: "staff" };
  }
  return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
}


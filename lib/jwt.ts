import { SignJWT, jwtVerify } from "jose";

if (!process.env.JWT_SECRET) {
  throw new Error("JWT_SECRET belum diisi di .env");
}

const secret = new TextEncoder().encode(process.env.JWT_SECRET);

export type CustomerTokenPayload = {
  sub: number | string; // customer id
  type: "customer";
};

export type StaffTokenPayload = {
  sub: number | string; // staff id
  type: "staff";
  role: "super_admin" | "outlet_admin";
  outletId: number | string | null;
  email?: string;
  fullName?: string;
};



export type TokenPayload = CustomerTokenPayload | StaffTokenPayload;

export async function signToken(payload: TokenPayload, expiresIn = "30d") {
  return new SignJWT({ ...payload, sub: String(payload.sub) })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(expiresIn)
    .sign(secret);
}


export async function verifyToken<T extends TokenPayload = TokenPayload>(
  token: string,
): Promise<T> {
  const { payload } = await jwtVerify(token, secret);
  return payload as unknown as T;
}

/** Ambil & verifikasi Bearer token dari header Authorization. Return null kalau tidak ada/invalid. */
export async function getTokenFromRequest<T extends TokenPayload = TokenPayload>(
  req: Request,
): Promise<T | null> {
  const header = req.headers.get("authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return null;
  try {
    return await verifyToken<T>(token);
  } catch {
    return null;
  }
}

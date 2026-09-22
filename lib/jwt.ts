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

/**
 * Menghitung waktu Unix timestamp (dalam detik) tepat pada pergantian hari (00:00:00 WIB / Asia/Jakarta).
 * Waktu Indonesia Barat (WIB) adalah UTC+7.
 */
export function getMidnightWibExpirationSeconds(): number {
  const now = new Date();
  // Waktu saat ini dalam UTC milliseconds
  const utcMillis = now.getTime() + now.getTimezoneOffset() * 60000;
  // Waktu saat ini dalam WIB (UTC+7)
  const wibDate = new Date(utcMillis + 7 * 3600000);

  // Set ke jam 00:00:00 hari berikutnya (besok) dalam zona WIB
  const nextMidnightWib = new Date(wibDate);
  nextMidnightWib.setDate(nextMidnightWib.getDate() + 1);
  nextMidnightWib.setHours(0, 0, 0, 0);

  // Konversi kembali ke UTC timestamp
  const expirationUtc = new Date(nextMidnightWib.getTime() - 7 * 3600000);
  return Math.floor(expirationUtc.getTime() / 1000);
}

export async function signToken(
  payload: TokenPayload,
  expiresIn?: string | number,
) {
  // Untuk staff: default berlaku 1 hari kalender (berakhir tepat jam 00:00 WIB pergantian hari)
  const finalExpiry =
    expiresIn !== undefined
      ? expiresIn
      : payload.type === "staff"
        ? getMidnightWibExpirationSeconds()
        : "30d";

  return new SignJWT({ ...payload, sub: String(payload.sub) })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(finalExpiry)
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

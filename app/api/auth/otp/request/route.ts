import { NextResponse } from "next/server";
import { sql } from "@/src/db/client";
import { sendNotification } from "@/lib/notifications";

function generateOtp() {
  return Math.floor(100000 + Math.random() * 900000).toString(); // 6 digit
}

/**
 * POST /api/auth/otp/request
 * body: { target: string, channel: "email" | "whatsapp" }
 *
 * Kirim OTP ke email/no hp. Terintegrasi langsung dengan Fonnte (WhatsApp).
 * Di NODE_ENV development, kode OTP juga ikut dikembalikan di response biar gampang dites.
 */
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const target = body?.target?.trim();
  const channel = body?.channel;

  if (!target || !["email", "whatsapp"].includes(channel)) {
    return NextResponse.json(
      { error: "target dan channel ('email' | 'whatsapp') wajib diisi" },
      { status: 400 },
    );
  }

  const code = generateOtp();
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 menit

  // Cek apakah customer sudah pernah daftar
  const existing = await sql`
    select id from customers where email = ${target} or phone = ${target} limit 1
  `;
  const purpose = existing.length > 0 ? "login" : "register";

  await sql`
    insert into otp_codes (target, channel, code, purpose, expires_at)
    values (${target}, ${channel}, ${code}, ${purpose}, ${expiresAt.toISOString()})
  `;

  // Kirim WhatsApp OTP otomatis via Fonnte jika channel === 'whatsapp'
  if (channel === "whatsapp") {
    await sendNotification(
      "otp_code",
      target,
      {
        otpCode: code,
        purpose: purpose === "register" ? "pendaftaran" : "login",
      },
      {}
    );
  } else {
    console.log(`[OTP] ${channel} ke ${target}: ${code} (purpose: ${purpose})`);
  }

  return NextResponse.json({
    message: "OTP terkirim",
    isNewCustomer: purpose === "register",
    ...(process.env.NODE_ENV !== "production" ? { devCode: code } : {}),
  });
}


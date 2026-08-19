import { NextResponse } from "next/server";
import { sql } from "@/src/db/client";
import { signToken } from "@/lib/jwt";

/**
 * GET /api/auth/sso/callback?code=...
 * Google redirect ke sini setelah staff pilih akun. Kita tukar `code` jadi
 * access_token, ambil email dari Google, lalu cocokkan ke tabel staff_users.
 *
 * PENTING: staff TIDAK bisa self-register lewat SSO. Akun (email + role + outlet)
 * harus sudah dibuat lebih dulu oleh super_admin lewat endpoint /api/staff-users
 * (Fase 3). SSO cuma cara login, bukan cara daftar — ini sengaja, supaya siapa
 * boleh akses panel admin tetap dikontrol dari dalam sistem, bukan "siapa saja
 * yang punya akun Google boleh masuk".
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const appUrl = process.env.APP_URL;
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const adminPanelUrl = process.env.ADMIN_PANEL_URL; // mis. http://localhost:5173

  if (!code || !appUrl || !clientId || !clientSecret) {
    return NextResponse.json({ error: "SSO belum dikonfigurasi lengkap" }, { status: 500 });
  }

  // Tukar authorization code jadi access token
  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: `${appUrl}/api/auth/sso/callback`,
      grant_type: "authorization_code",
    }),
  });
  const tokenData = await tokenRes.json();
  if (!tokenRes.ok) {
    return NextResponse.json({ error: "Gagal tukar token Google", detail: tokenData }, { status: 400 });
  }

  // Ambil profil (email) dari Google
  const profileRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
    headers: { Authorization: `Bearer ${tokenData.access_token}` },
  });
  const profile = await profileRes.json();
  const email = profile.email as string | undefined;

  if (!email) {
    return NextResponse.json({ error: "Tidak dapat email dari Google" }, { status: 400 });
  }

  const rows = await sql`select * from staff_users where email = ${email} and is_active = true limit 1`;
  const staff = rows[0];

  if (!staff) {
    // Email belum terdaftar sebagai staff -> tolak, jangan auto-create
    const errorRedirect = adminPanelUrl ? `${adminPanelUrl}/login?error=not_registered` : null;
    if (errorRedirect) return NextResponse.redirect(errorRedirect);
    return NextResponse.json({ error: `Email ${email} belum terdaftar sebagai staff` }, { status: 403 });
  }

  await sql`update staff_users set sso_provider = 'google', sso_subject = ${profile.id} where id = ${staff.id}`;

  const token = await signToken({
    sub: staff.id,
    type: "staff",
    role: staff.role,
    outletId: staff.outlet_id,
  });

  if (adminPanelUrl) {
    // Redirect balik ke admin panel bawa token di query — admin panel simpan ke localStorage lalu bersihkan URL
    return NextResponse.redirect(`${adminPanelUrl}/sso-callback?token=${token}`);
  }
  return NextResponse.json({ token });
}

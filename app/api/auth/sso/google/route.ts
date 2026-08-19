import { NextResponse } from "next/server";

/**
 * GET /api/auth/sso/google
 * Arahkan browser admin panel ke sini untuk mulai login SSO Google.
 * Butuh env: GOOGLE_CLIENT_ID, APP_URL (buat redirect_uri)
 */
export async function GET() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const appUrl = process.env.APP_URL; // mis. http://localhost:3000

  if (!clientId || !appUrl) {
    return NextResponse.json(
      { error: "GOOGLE_CLIENT_ID / APP_URL belum diset di .env" },
      { status: 500 },
    );
  }

  const redirectUri = `${appUrl}/api/auth/sso/callback`;
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "openid email profile",
    access_type: "online",
    prompt: "select_account",
  });

  return NextResponse.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
}

import { NextResponse } from "next/server";
import { sql } from "@/src/db/client";
import { signToken } from "@/lib/jwt";

/**
 * POST /api/auth/customer/google
 * Body: { idToken?: string, credential?: string }
 *
 * Menerima Google ID Token dari mobile app / web client (In-App Google Sign-In),
 * memvalidasi langsung ke Google, lalu melakukan login atau auto-registrasi customer baru.
 */
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);
    const idToken = (body?.idToken || body?.credential)?.trim();
    const accessToken = body?.accessToken?.trim();

    if (!idToken && !accessToken) {
      return NextResponse.json(
        { error: "Token Google wajib disertakan" },
        { status: 400 }
      );
    }

    let email = "";
    let googleSub = "";
    let fullName: string | null = null;
    let avatarUrl: string | null = null;

    if (idToken) {
      // 1A. Validasi idToken ke server Google tokeninfo
      const verifyRes = await fetch(
        `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`
      );
      const googlePayload = await verifyRes.json();

      if (!verifyRes.ok || !googlePayload?.email) {
        return NextResponse.json(
          {
            error: "Token Google tidak valid atau sudah kedaluwarsa",
            detail: googlePayload?.error_description || googlePayload?.error,
          },
          { status: 401 }
        );
      }

      email = String(googlePayload.email).trim().toLowerCase();
      googleSub = String(googlePayload.sub || "").trim();
      fullName = String(googlePayload.name || googlePayload.given_name || "").trim() || null;
      avatarUrl = String(googlePayload.picture || "").trim() || null;
    } else if (accessToken) {
      // 1B. Validasi accessToken ke Google userinfo endpoint
      const profileRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const profile = await profileRes.json();

      if (!profileRes.ok || !profile?.email) {
        return NextResponse.json(
          {
            error: "Access token Google tidak valid atau sudah kedaluwarsa",
            detail: profile?.error,
          },
          { status: 401 }
        );
      }

      email = String(profile.email).trim().toLowerCase();
      googleSub = String(profile.id || "").trim();
      fullName = String(profile.name || profile.given_name || "").trim() || null;
      avatarUrl = String(profile.picture || "").trim() || null;
    }

    if (!email) {
      return NextResponse.json(
        { error: "Tidak dapat menemukan alamat email pada profil Google" },
        { status: 400 }
      );
    }

    // 2. Cari apakah customer sudah pernah terdaftar (berdasarkan email atau sso_subject)
    const existingRows = await sql`
      SELECT * FROM customers 
      WHERE email = ${email} OR (sso_provider = 'google' AND sso_subject = ${googleSub})
      LIMIT 1
    `;

    let customer = existingRows[0];

    if (customer) {
      // Akun sudah ada -> Update info profil & tautkan sso
      const updateRows = await sql`
        UPDATE customers
        SET 
          sso_provider = 'google',
          sso_subject = ${googleSub},
          avatar_url = COALESCE(${avatarUrl}, avatar_url),
          full_name = COALESCE(full_name, ${fullName}),
          is_verified = true
        WHERE id = ${customer.id}
        RETURNING *
      `;
      customer = updateRows[0] || customer;
    } else {
      // Akun baru -> Auto-registrasi customer baru
      const insertRows = await sql`
        INSERT INTO customers (
          email,
          full_name,
          avatar_url,
          sso_provider,
          sso_subject,
          is_verified
        )
        VALUES (
          ${email},
          ${fullName},
          ${avatarUrl},
          'google',
          ${googleSub},
          true
        )
        RETURNING *
      `;
      customer = insertRows[0];

      // Inisialisasi poin loyalitas 0 untuk customer baru
      await sql`
        INSERT INTO customer_loyalty (customer_id, points, total_orders)
        VALUES (${customer.id}, 0, 0)
        ON CONFLICT (customer_id) DO NOTHING
      `;
    }

    // 3. Menerbitkan JWT autentikasi customer
    const token = await signToken({
      sub: customer.id,
      type: "customer",
    });

    const hasPin = Boolean(customer.pin && String(customer.pin).trim());

    return NextResponse.json({
      token,
      hasPin,
      customer: {
        id: customer.id,
        email: customer.email,
        phone: customer.phone,
        fullName: customer.full_name,
        avatarUrl: customer.avatar_url,
        hasPin,
      },
    });
  } catch (err: any) {
    console.error("[auth/customer/google] Error:", err);
    return NextResponse.json(
      { error: err?.message || "Terjadi kesalahan saat memproses login Google" },
      { status: 500 }
    );
  }
}

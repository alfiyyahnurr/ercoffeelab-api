import { NextResponse } from "next/server";
import { sql } from "@/src/db/client";
import { requireStaff } from "@/lib/auth-middleware";
import { formatNotificationTemplate } from "./utils";

/**
 * GET /api/notification-templates
 * Super Admin only — Mengambil semua template notifikasi.
 */
export async function GET(req: Request) {
  const auth = await requireStaff(req, ["super_admin"]);
  if ("error" in auth) return auth.error;

  const rows = await sql`SELECT * FROM notification_templates ORDER BY code ASC`;
  const data = rows.map(formatNotificationTemplate);
  return NextResponse.json({ data });
}

/**
 * POST /api/notification-templates
 * Super Admin only — Membuat template notifikasi baru.
 */
export async function POST(req: Request) {
  const auth = await requireStaff(req, ["super_admin"]);
  if ("error" in auth) return auth.error;

  const body = await req.json().catch(() => null);
  const code = body?.code?.trim()?.toLowerCase();
  const channel = body?.channel?.trim()?.toLowerCase();
  const bodyTemplate = body?.bodyTemplate?.trim();

  if (!code || !channel || !bodyTemplate) {
    return NextResponse.json(
      { error: "code, channel, dan bodyTemplate wajib diisi" },
      { status: 400 },
    );
  }

  if (!["whatsapp", "email"].includes(channel)) {
    return NextResponse.json(
      { error: "channel wajib 'whatsapp' atau 'email'" },
      { status: 400 },
    );
  }

  // Cek duplikasi code
  const dupCheck = await sql`
    SELECT id FROM notification_templates WHERE LOWER(code) = ${code}
  `;
  if (dupCheck[0]) {
    return NextResponse.json(
      { error: "Kode template notifikasi sudah ada" },
      { status: 409 },
    );
  }

  const subject = body.subject?.trim() || null;

  const insertedRows = await sql`
    INSERT INTO notification_templates (code, channel, subject, body_template, is_active)
    VALUES (${code}, ${channel}, ${subject}, ${bodyTemplate}, true)
    RETURNING *
  `;

  return NextResponse.json(formatNotificationTemplate(insertedRows[0]), { status: 201 });
}

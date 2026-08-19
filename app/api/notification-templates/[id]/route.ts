import { NextResponse } from "next/server";
import { sql } from "@/src/db/client";
import { requireStaff } from "@/lib/auth-middleware";
import { formatNotificationTemplate } from "../utils";

/**
 * PATCH /api/notification-templates/:id
 * Super Admin only — Update data template notifikasi.
 */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const targetId = Number(id);
  if (isNaN(targetId)) {
    return NextResponse.json({ error: "ID template tidak valid" }, { status: 400 });
  }

  const auth = await requireStaff(req, ["super_admin"]);
  if ("error" in auth) return auth.error;

  const existingRows = await sql`
    SELECT * FROM notification_templates WHERE id = ${targetId}
  `;
  const existing = existingRows[0];

  if (!existing) {
    return NextResponse.json({ error: "Template notifikasi tidak ditemukan" }, { status: 404 });
  }

  const body = await req.json().catch(() => null);
  if (!body || Object.keys(body).length === 0) {
    return NextResponse.json({ error: "Data update tidak boleh kosong" }, { status: 400 });
  }

  let code = existing.code;
  if (body.code !== undefined) {
    code = typeof body.code === "string" ? body.code.trim().toLowerCase() : "";
    if (!code) {
      return NextResponse.json({ error: "code tidak boleh kosong" }, { status: 400 });
    }
    const dupCheck = await sql`
      SELECT id FROM notification_templates WHERE LOWER(code) = ${code} AND id != ${targetId}
    `;
    if (dupCheck[0]) {
      return NextResponse.json(
        { error: "Kode template notifikasi sudah digunakan" },
        { status: 409 },
      );
    }
  }

  let channel = existing.channel;
  if (body.channel !== undefined) {
    channel = String(body.channel).trim().toLowerCase();
    if (!["whatsapp", "email"].includes(channel)) {
      return NextResponse.json(
        { error: "channel wajib 'whatsapp' atau 'email'" },
        { status: 400 },
      );
    }
  }

  const subject =
    body.subject !== undefined
      ? body.subject === null
        ? null
        : String(body.subject).trim()
      : existing.subject;

  let bodyTemplate = existing.body_template;
  if (body.bodyTemplate !== undefined) {
    bodyTemplate = String(body.bodyTemplate).trim();
    if (!bodyTemplate) {
      return NextResponse.json({ error: "bodyTemplate tidak boleh kosong" }, { status: 400 });
    }
  }

  const isActive =
    body.isActive !== undefined ? Boolean(body.isActive) : Boolean(existing.is_active);

  const updatedRows = await sql`
    UPDATE notification_templates
    SET
      code = ${code},
      channel = ${channel},
      subject = ${subject},
      body_template = ${bodyTemplate},
      is_active = ${isActive}
    WHERE id = ${targetId}
    RETURNING *
  `;

  return NextResponse.json(formatNotificationTemplate(updatedRows[0]));
}

/**
 * DELETE /api/notification-templates/:id
 * Super Admin only — Menghapus template notifikasi.
 */
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const targetId = Number(id);
  if (isNaN(targetId)) {
    return NextResponse.json({ error: "ID template tidak valid" }, { status: 400 });
  }

  const auth = await requireStaff(req, ["super_admin"]);
  if ("error" in auth) return auth.error;

  const existingRows = await sql`
    SELECT id FROM notification_templates WHERE id = ${targetId}
  `;
  if (!existingRows[0]) {
    return NextResponse.json({ error: "Template notifikasi tidak ditemukan" }, { status: 404 });
  }

  const code = existingRows[0].code;

  try {
    await sql`DELETE FROM notification_templates WHERE id = ${targetId}`;
    return NextResponse.json({ success: true });
  } catch (err: any) {
    if (err.code === "23503") {
      return NextResponse.json(
        { error: "Template tidak dapat dihapus karena memiliki log notifikasi terkait" },
        { status: 400 },
      );
    }
    throw err;
  }
}


import { sql } from "@/src/db/client";

/**
 * Render template + kirim notifikasi via WhatsApp (Fonnte API) dan/atau Email (Resend / SMTP).
 * Channel yang didukung: 'whatsapp' | 'email' | 'both'.
 */
export async function sendNotification(
  templateCode: string,
  targetPhone: string,
  variables: Record<string, string>,
  context: {
    orderId?: number | string;
    customerId?: number | string;
    targetEmail?: string;
    overrideChannel?: "whatsapp" | "email" | "both";
  },
) {
  const templates = await sql`
    SELECT * FROM notification_templates WHERE code = ${templateCode} AND is_active = true LIMIT 1
  `;
  const template = templates[0];
  if (!template) {
    console.warn(
      `[notification] Template '${templateCode}' tidak ditemukan/nonaktif, skip.`,
    );
    return;
  }

  let body = template.body_template as string;
  let subject = (template.subject_template as string) || `ERCoffeeLab - ${template.name || 'Pemberitahuan'}`;

  for (const [key, value] of Object.entries(variables)) {
    body = body.replaceAll(`{{${key}}}`, value);
    subject = subject.replaceAll(`{{${key}}}`, value);
  }

  const effectiveChannel = context.overrideChannel || template.channel || "whatsapp";
  const fonnteApiKey = process.env.FONNTE_API_KEY?.trim() || process.env.FONTEE_API_KEY?.trim();
  const resendApiKey = process.env.RESEND_API_KEY?.trim();

  const results: { whatsapp?: { status: string; res: any }; email?: { status: string; res: any } } = {};

  // 1. KIRIM VIA WHATSAPP (Jika channel whatsapp / both)
  if ((effectiveChannel === "whatsapp" || effectiveChannel === "both") && targetPhone) {
    if (fonnteApiKey) {
      try {
        const fonnteRes = await fetch("https://api.fonnte.com/send", {
          method: "POST",
          headers: {
            Authorization: fonnteApiKey,
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: new URLSearchParams({
            target: targetPhone,
            message: body,
          }),
        });

        const apiResponse = await fonnteRes.json().catch(() => null);
        if (fonnteRes.ok && (apiResponse?.status === true || apiResponse?.status === "true")) {
          results.whatsapp = { status: "sent", res: apiResponse };
          console.log(`[notification:whatsapp:sent] Ke ${targetPhone} via Fonnte ✅`);
        } else {
          results.whatsapp = { status: "failed", res: apiResponse };
          console.error(`[notification:whatsapp:failed] Gagal kirim ke ${targetPhone}:`, apiResponse);
        }
      } catch (err: any) {
        results.whatsapp = { status: "failed", res: { error: err.message } };
        console.error(`[notification:whatsapp:error] Error Fonnte:`, err);
      }
    } else {
      results.whatsapp = { status: "simulated", res: "FONNTE_API_KEY belum diset" };
      console.log(`[notification:whatsapp:simulated] Ke ${targetPhone}: ${body}`);
    }
  }

  // 2. KIRIM VIA EMAIL (Jika channel email / both)
  if ((effectiveChannel === "email" || effectiveChannel === "both") && context.targetEmail) {
    if (resendApiKey) {
      try {
        const resendRes = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${resendApiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from: "ERCoffeeLab <no-reply@ercoffeelab.com>",
            to: [context.targetEmail],
            subject: subject,
            text: body,
            html: `<div style="font-family: sans-serif; padding: 20px; background: #F6F3EC; border-radius: 12px; color: #181F4B;">
              <h2 style="color: #C9A876;">☕ ERCoffeeLab</h2>
              <p style="white-space: pre-wrap; font-size: 14px;">${body}</p>
              <hr style="border: 0; border-top: 1px solid #E7E8F0; margin: 20px 0;" />
              <p style="font-size: 11px; color: #6B7088;">Pesan ini dikirim otomatis oleh ERCoffeeLab System.</p>
            </div>`,
          }),
        });

        const resendData = await resendRes.json().catch(() => null);
        if (resendRes.ok) {
          results.email = { status: "sent", res: resendData };
          console.log(`[notification:email:sent] Ke ${context.targetEmail} via Resend ✅`);
        } else {
          results.email = { status: "failed", res: resendData };
          console.error(`[notification:email:failed] Gagal kirim email ke ${context.targetEmail}:`, resendData);
        }
      } catch (err: any) {
        results.email = { status: "failed", res: { error: err.message } };
        console.error(`[notification:email:error] Error Resend:`, err);
      }
    } else {
      results.email = { status: "simulated", res: "RESEND_API_KEY belum diset" };
      console.log(`[notification:email:simulated] Ke ${context.targetEmail}: [${subject}] ${body}`);
    }
  }

  // 3. LOGGING KE DATABASE
  const finalStatus =
    (results.whatsapp?.status === "sent" || results.email?.status === "sent")
      ? "sent"
      : (results.whatsapp?.status === "simulated" || results.email?.status === "simulated")
      ? "sent"
      : "failed";

  const payload = {
    channel: effectiveChannel,
    targetPhone,
    targetEmail: context.targetEmail || null,
    subject,
    body,
    results,
  };

  await sql`
    INSERT INTO notification_logs (template_code, order_id, customer_id, channel, target, payload, status)
    VALUES (
      ${templateCode},
      ${context.orderId || null},
      ${context.customerId || null},
      ${effectiveChannel},
      ${context.targetEmail ? `${targetPhone} / ${context.targetEmail}` : targetPhone},
      ${JSON.stringify(payload)},
      ${finalStatus}
    )
  `;
}

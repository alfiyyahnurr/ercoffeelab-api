import { sql } from "@/src/db/client";

/**
 * Render template + kirim notifikasi WhatsApp via Fonnte API (https://api.fonnte.com/send).
 * Jika FONTEE_API_KEY diset di .env, pesan WhatsApp beneran dikirim ke nomor target.
 * Jika FONTEE_API_KEY belum diset, pesan dicatat dengan status 'pending' (log simulasi console).
 */
export async function sendNotification(
  templateCode: string,
  target: string,
  variables: Record<string, string>,
  context: { orderId?: number | string; customerId?: number | string },
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
  for (const [key, value] of Object.entries(variables)) {
    body = body.replaceAll(`{{${key}}}`, value);
  }

  const apiKey = process.env.FONNTE_API_KEY?.trim() || process.env.FONTEE_API_KEY?.trim();
  let status = "pending";
  let apiResponse: any = null;

  if (apiKey) {
    try {
      const fonnteRes = await fetch("https://api.fonnte.com/send", {
        method: "POST",
        headers: {
          Authorization: apiKey,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          target,
          message: body,
        }),
      });

      apiResponse = await fonnteRes.json().catch(() => null);
      if (fonnteRes.ok && (apiResponse?.status === true || apiResponse?.status === "true")) {
        status = "sent";
        console.log(`[notification:whatsapp:sent] Ke ${target} via Fonnte ✅`);
      } else {
        status = "failed";
        console.error(
          `[notification:whatsapp:failed] Gagal kirim ke ${target} via Fonnte:`,
          apiResponse,
        );
      }
    } catch (err: any) {
      status = "failed";
      apiResponse = { error: err.message || "Network error ke Fonnte API" };
      console.error(`[notification:whatsapp:error] Error fetch Fonnte:`, err);
    }
  } else {
    console.log(
      `[notification:whatsapp:simulated] Ke ${target}: ${body} (FONNTE_API_KEY belum diset di .env)`,
    );
  }


  const payload = {
    channel: template.channel,
    target,
    body,
    fonnteResponse: apiResponse,
  };

  await sql`
    INSERT INTO notification_logs (template_code, order_id, customer_id, channel, target, payload, status)
    VALUES (
      ${templateCode},
      ${context.orderId || null},
      ${context.customerId || null},
      ${template.channel},
      ${target},
      ${JSON.stringify(payload)},
      ${status}
    )
  `;
}

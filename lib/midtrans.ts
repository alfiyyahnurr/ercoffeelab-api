import crypto from "crypto";
import { sql } from "@/src/db/client";

const IS_PRODUCTION = process.env.MIDTRANS_IS_PRODUCTION === "true"; // default false = sandbox
const SNAP_BASE_URL = IS_PRODUCTION
  ? "https://app.midtrans.com/snap/v1"
  : "https://app.sandbox.midtrans.com/snap/v1";

function serverKeyAuthHeader() {
  const serverKey = process.env.MIDTRANS_SERVER_KEY;
  if (!serverKey) throw new Error("MIDTRANS_SERVER_KEY belum diisi di .env");
  return "Basic " + Buffer.from(`${serverKey}:`).toString("base64");
}

/**
 * Buat transaksi Snap (dapat snap_token + redirect_url).
 * Selalu mengarah ke Midtrans SANDBOX kecuali MIDTRANS_IS_PRODUCTION=true di .env.
 * Semua request & response dicatat ke payment_logs (poin 19).
 */
export async function createSnapTransaction(order: {
  id: string;
  orderNumber: string;
  total: number;
  customerEmail?: string | null;
  customerPhone?: string | null;
}) {
  const body = {
    transaction_details: {
      order_id: order.orderNumber, // Midtrans butuh order_id unik, bukan uuid internal
      gross_amount: order.total,
    },
    customer_details: {
      email: order.customerEmail || undefined,
      phone: order.customerPhone || undefined,
    },
    // Dummy/simulasi: item_details boleh disederhanakan jadi 1 baris total,
    // tidak wajib breakdown per produk untuk keperluan sandbox testing.
    item_details: [
      {
        id: order.id,
        price: order.total,
        quantity: 1,
        name: `Order ${order.orderNumber}`,
      },
    ],
  };

  await sql`
    insert into payment_logs (order_id, direction, provider, payload)
    values (${order.id}, 'request', 'midtrans', ${JSON.stringify(body)})
  `;

  const res = await fetch(`${SNAP_BASE_URL}/transactions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: serverKeyAuthHeader(),
    },
    body: JSON.stringify(body),
  });
  const data = await res.json();

  await sql`
    insert into payment_logs (order_id, direction, provider, payload, http_status)
    values (${order.id}, 'response', 'midtrans', ${JSON.stringify(data)}, ${res.status})
  `;

  if (!res.ok) {
    throw new Error(
      data.error_messages?.join(", ") || "Gagal membuat transaksi Midtrans",
    );
  }

  return data as { token: string; redirect_url: string };
}

/**
 * Verifikasi signature webhook Midtrans.
 * Formula resmi: SHA512(order_id + status_code + gross_amount + ServerKey)
 */
export function verifyMidtransSignature(payload: {
  order_id: string;
  status_code: string;
  gross_amount: string;
  signature_key: string;
}) {
  const serverKey = process.env.MIDTRANS_SERVER_KEY;
  if (!serverKey) throw new Error("MIDTRANS_SERVER_KEY belum diisi di .env");
  const expected = crypto
    .createHash("sha512")
    .update(
      payload.order_id + payload.status_code + payload.gross_amount + serverKey,
    )
    .digest("hex");
  return expected === payload.signature_key;
}

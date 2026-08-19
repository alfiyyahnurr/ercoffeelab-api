import { NextResponse } from "next/server";
import { sql } from "@/src/db/client";
import { verifyMidtransSignature } from "@/lib/midtrans";
import { recalculateLoyaltyTier } from "@/lib/loyalty";
import { sendNotification } from "@/lib/notifications";

/**
 * POST /api/webhooks/midtrans
 * Dipanggil OTOMATIS oleh Midtrans (sandbox atau production) setiap status
 * transaksi berubah. TIDAK pakai JWT — otentikasi lewat signature_key.
 *
 * Set URL ini di dashboard.sandbox.midtrans.com > Settings > Configuration >
 * "Payment Notification URL": https://<domain-kamu>/api/webhooks/midtrans
 * (pas development lokal, pakai tunnel seperti ngrok supaya Midtrans bisa reach localhost)
 */
export async function POST(req: Request) {
  const payload = await req.json().catch(() => null);
  if (!payload)
    return NextResponse.json({ error: "Payload tidak valid" }, { status: 400 });

  const {
    order_id,
    status_code,
    gross_amount,
    signature_key,
    transaction_status,
    fraud_status,
  } = payload;

  const validSignature = verifyMidtransSignature({
    order_id,
    status_code,
    gross_amount,
    signature_key,
  });
  if (!validSignature) {
    return NextResponse.json(
      { error: "Signature tidak valid" },
      { status: 403 },
    );
  }

  const orders =
    await sql`select * from orders where order_number = ${order_id} limit 1`;
  const order = orders[0];
  if (!order)
    return NextResponse.json(
      { error: "Order tidak ditemukan" },
      { status: 404 },
    );

  await sql`
    insert into payment_logs (order_id, direction, provider, payload)
    values (${order.id}, 'webhook', 'midtrans', ${JSON.stringify(payload)})
  `;

  const isPaid =
    (transaction_status === "capture" && fraud_status === "accept") ||
    transaction_status === "settlement";

  if (isPaid && order.payment_status !== "paid") {
    await sql`
      update orders set payment_status = 'paid', paid_at = now(), order_status = 'confirmed'
      where id = ${order.id}
    `;
    await sql`
      insert into order_status_logs (order_id, status) values (${order.id}, 'confirmed')
    `;

    const result = await recalculateLoyaltyTier(
      order.customer_id,
      order.id,
      order.total,
    );

    const customers =
      await sql`select * from customers where id = ${order.customer_id} limit 1`;
    const customer = customers[0];
    const target = customer?.phone || customer?.email;
    if (target) {
      await sendNotification(
        "order_paid",
        target,
        {
          customer_name: customer.full_name || "Pelanggan",
          order_number: order.order_number,
        },
        { orderId: order.id, customerId: order.customer_id },
      );
    }

    return NextResponse.json({ status: "ok", paid: true, loyalty: result });
  }

  if (
    transaction_status === "cancel" ||
    transaction_status === "expire" ||
    transaction_status === "deny"
  ) {
    await sql`update orders set order_status = 'cancelled' where id = ${order.id}`;
    await sql`insert into order_status_logs (order_id, status) values (${order.id}, 'cancelled')`;
  }

  return NextResponse.json({ status: "ok", paid: false });
}

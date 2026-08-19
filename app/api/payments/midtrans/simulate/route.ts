import { NextResponse } from "next/server";
import { sql } from "@/src/db/client";
import { recalculateLoyaltyTier } from "@/lib/loyalty";
import { sendNotification } from "@/lib/notifications";

/**
 * POST /api/payments/midtrans/simulate
 * body: { orderId, result: "success" | "failure" }
 *
 * ⚠️ DEV/DEMO ONLY — dinonaktifkan otomatis kalau NODE_ENV=production.
 *
 * Endpoint ini MELEWATI Midtrans sepenuhnya (tidak ada network call, tidak
 * perlu MIDTRANS_SERVER_KEY, tidak perlu ngrok/tunnel). Berguna untuk:
 * - Testing alur order→paid→loyalty→notifikasi tanpa akun Midtrans sandbox beneran
 * - Demo ke stakeholder tanpa perlu setup payment gateway asli
 *
 * Kalau MIDTRANS_SERVER_KEY sudah diisi dan mau tes jalur sungguhan (charge
 * real ke sandbox Midtrans + bayar pakai kartu test mereka), pakai
 * /api/payments/midtrans/charge + webhook asli, BUKAN endpoint ini.
 */
export async function POST(req: Request) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json(
      { error: "Endpoint simulasi dinonaktifkan di production" },
      { status: 403 },
    );
  }

  const body = await req.json().catch(() => null);
  const orderId = body?.orderId;
  const result = body?.result === "failure" ? "failure" : "success";

  if (!orderId)
    return NextResponse.json({ error: "orderId wajib diisi" }, { status: 400 });

  const orders = await sql`select * from orders where id = ${orderId} limit 1`;
  const order = orders[0];
  if (!order)
    return NextResponse.json(
      { error: "Order tidak ditemukan" },
      { status: 404 },
    );

  // Catat sebagai payment_logs walau ini simulasi — supaya dev bisa lihat histori yang sama
  // seperti kalau webhook Midtrans asli yang masuk.
  const simulatedPayload = {
    order_id: order.order_number,
    transaction_status: result === "success" ? "settlement" : "deny",
    gross_amount: String(order.total),
    simulated: true,
  };
  await sql`
    insert into payment_logs (order_id, direction, provider, payload)
    values (${order.id}, 'webhook', 'midtrans-simulate', ${JSON.stringify(simulatedPayload)})
  `;

  if (result === "failure") {
    await sql`update orders set order_status = 'cancelled' where id = ${order.id}`;
    await sql`insert into order_status_logs (order_id, status) values (${order.id}, 'cancelled')`;
    return NextResponse.json({ status: "ok", paid: false, simulated: true });
  }

  await sql`
    update orders set payment_status = 'paid', paid_at = now(), order_status = 'confirmed'
    where id = ${order.id}
  `;
  await sql`insert into order_status_logs (order_id, status) values (${order.id}, 'confirmed')`;

  const loyaltyResult = await recalculateLoyaltyTier(
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

  return NextResponse.json({
    status: "ok",
    paid: true,
    simulated: true,
    loyalty: loyaltyResult,
  });
}

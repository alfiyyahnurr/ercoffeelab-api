import { NextResponse } from "next/server";
import { sql } from "@/src/db/client";
import { recalculateLoyaltyTier } from "@/lib/loyalty";
import { sendNotification } from "@/lib/notifications";
import { commitPaidOrderFromDraft } from "@/lib/checkout";

/**
 * POST /api/payments/midtrans/simulate
 * body: { orderId?, orderNumber?, result: "success" | "failure" }
 */
export async function POST(req: Request) {
  if (process.env.MIDTRANS_IS_PRODUCTION === "true") {
    return NextResponse.json(
      { error: "Endpoint simulasi dinonaktifkan di environment production Midtrans" },
      { status: 403 },
    );
  }

  const body = await req.json().catch(() => null);
  const orderId = body?.orderId;
  const orderNumber = body?.orderNumber || (typeof orderId === "string" && orderId.startsWith("ERC-") ? orderId : null);
  const result = body?.result === "failure" ? "failure" : "success";

  if (!orderId && !orderNumber)
    return NextResponse.json({ error: "orderId atau orderNumber wajib diisi" }, { status: 400 });

  let order: any = null;

  // Cek apakah order sudah ada di tabel orders
  if (orderId && !isNaN(Number(orderId))) {
    const orders = await sql`select * from orders where id = ${orderId} limit 1`;
    order = orders[0];
  } else if (orderNumber) {
    const orders = await sql`select * from orders where order_number = ${orderNumber} limit 1`;
    order = orders[0];
  }

  // Jika order belum ada di tabel orders tapi result = success, commit dari draft!
  if (!order && result === "success" && orderNumber) {
    order = await commitPaidOrderFromDraft(orderNumber, true);
  }

  if (!order && result === "success") {
    // Cari draft berdasarkan id jika orderId bukan number
    const drafts = await sql`select * from payment_drafts where id::text = ${String(orderId)} or order_number = ${String(orderId)} limit 1`;
    if (drafts[0]) {
      order = await commitPaidOrderFromDraft(drafts[0].order_number, true);
    }
  }

  if (!order && result === "failure") {
    if (orderNumber) {
      await sql`DELETE FROM payment_drafts WHERE order_number = ${orderNumber}`;
    }
    return NextResponse.json({ status: "ok", paid: false, simulated: true });
  }

  if (!order) {
    return NextResponse.json(
      { error: "Draft transaksi atau order tidak ditemukan" },
      { status: 404 },
    );
  }

  // Catat payment_logs
  const simulatedPayload = {
    order_id: order.order_number,
    transaction_status: result === "success" ? "settlement" : "deny",
    gross_amount: String(order.total),
    simulated: true,
  };
  await sql`
    insert into payment_logs (order_id, order_number, direction, provider, payload)
    values (${order.id}, ${order.order_number}, 'webhook', 'midtrans-simulate', ${JSON.stringify(simulatedPayload)})
  `;

  if (result === "failure") {
    await sql`update orders set order_status = 'cancelled' where id = ${order.id}`;
    await sql`insert into order_status_logs (order_id, status) values (${order.id}, 'cancelled')`;
    return NextResponse.json({ status: "ok", paid: false, simulated: true, orderId: order.id });
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
    orderId: order.id,
    orderNumber: order.order_number,
    loyalty: loyaltyResult,
  });
}


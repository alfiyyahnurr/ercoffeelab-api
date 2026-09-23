import { NextResponse } from "next/server";
import { sql } from "@/src/db/client";
import { verifyMidtransSignature } from "@/lib/midtrans";
import { recalculateLoyaltyTier } from "@/lib/loyalty";
import { sendNotification } from "@/lib/notifications";
import { commitPaidOrderFromDraft } from "@/lib/checkout";

/**
 * POST /api/webhooks/midtrans
 * Dipanggil OTOMATIS oleh Midtrans (sandbox atau production) setiap status transaksi berubah.
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

  // Ekstrak base order number (contoh: ERC-20260921-9679-1726904123 -> ERC-20260921-9679)
  const baseOrderNumberMatch = String(order_id).match(/^(ERC-\d+-\d+)/);
  const targetOrderNumber = baseOrderNumberMatch ? baseOrderNumberMatch[1] : String(order_id);

  const isPaid =
    (transaction_status === "capture" && fraud_status === "accept") ||
    transaction_status === "settlement";

  // Cek apakah order sudah ada di tabel orders
  const orders = await sql`
    SELECT * FROM orders 
    WHERE order_number = ${targetOrderNumber} OR order_number = ${String(order_id)}
    LIMIT 1
  `;
  let order: Record<string, any> | null = orders[0] || null;

  // Jika belum ada di orders tapi statusnya PAID/Settlement, commit dari draft!
  if (!order && isPaid) {
    order = await commitPaidOrderFromDraft(targetOrderNumber);
  }

  // Catat payment log
  await sql`
    insert into payment_logs (order_id, order_number, direction, provider, payload)
    values (${order?.id || null}, ${targetOrderNumber}, 'webhook', 'midtrans', ${JSON.stringify(payload)})
  `;

  if (!order) {
    return NextResponse.json({ status: "ok", message: "Draft pending or expired" });
  }

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

    return NextResponse.json({ status: "ok", paid: true, orderId: order.id, loyalty: result });
  }

  if (
    transaction_status === "cancel" ||
    transaction_status === "expire" ||
    transaction_status === "deny"
  ) {
    if (order) {
      await sql`update orders set order_status = 'cancelled' where id = ${order.id}`;
      await sql`insert into order_status_logs (order_id, status) values (${order.id}, 'cancelled')`;
    }
    // Hapus draft jika ada
    await sql`DELETE FROM payment_drafts WHERE order_number = ${targetOrderNumber}`;
  }

  return NextResponse.json({ status: "ok", paid: isPaid, orderId: order?.id });
}


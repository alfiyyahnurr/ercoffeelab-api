import { NextResponse } from "next/server";
import { sql } from "@/src/db/client";
import { checkMidtransTransactionStatus } from "@/lib/midtrans";
import { recalculateLoyaltyTier } from "@/lib/loyalty";
import { sendNotification } from "@/lib/notifications";
import { commitPaidOrderFromDraft } from "@/lib/checkout";

/**
 * POST /api/payments/midtrans/check-status
 * body: { orderId?, orderNumber? }
 *
 * Memeriksa status transaksi pembayaran secara real-time langsung ke API Midtrans.
 * Jika status di Midtrans sudah settlement / capture (accept), backend akan langsung
 * membuat/mengupdate pesanan sah di orders (payment_status = 'paid'), memicu loyalitas & notifikasi.
 */
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const orderId = body?.orderId;
  const orderNumber = body?.orderNumber || (typeof orderId === "string" && orderId.startsWith("ERC-") ? orderId : null);

  if (!orderId && !orderNumber) {
    return NextResponse.json({ error: "orderId atau orderNumber wajib diisi" }, { status: 400 });
  }

  // 1. Ambil data order dari database (jika sudah dicommit)
  let order: any = null;
  if (orderId && !isNaN(Number(orderId))) {
    const orders = await sql`
      SELECT o.*, c.email AS customer_email, c.phone AS customer_phone, c.full_name AS customer_name
      FROM orders o
      LEFT JOIN customers c ON c.id = o.customer_id
      WHERE o.id = ${orderId}
      LIMIT 1
    `;
    order = orders[0];
  } else if (orderNumber) {
    const orders = await sql`
      SELECT o.*, c.email AS customer_email, c.phone AS customer_phone, c.full_name AS customer_name
      FROM orders o
      LEFT JOIN customers c ON c.id = o.customer_id
      WHERE o.order_number = ${orderNumber}
      LIMIT 1
    `;
    order = orders[0];
  }

  // 2. Jika di database sudah lunas, langsung return sukses
  if (order && order.payment_status === "paid") {
    return NextResponse.json({
      status: "ok",
      paid: true,
      orderId: order.id,
      orderNumber: order.order_number,
      paymentStatus: "paid",
      orderStatus: order.order_status,
      paidAt: order.paid_at,
    });
  }

  // 3. Kumpulkan kemungkinan Order ID / Attempt ID yang dikirim ke Midtrans
  const rawIdString = String(orderNumber || orderId || "");
  const baseMatch = rawIdString.match(/^(ERC-\d+-\d+)/);
  const targetOrderNumber = baseMatch ? baseMatch[1] : (orderNumber || order?.order_number || String(orderId));
  
  const candidates: string[] = [];
  const attemptIdParam = body?.attemptId;
  if (attemptIdParam) candidates.push(attemptIdParam);
  if (rawIdString && !candidates.includes(rawIdString)) candidates.push(rawIdString);
  if (targetOrderNumber && !candidates.includes(targetOrderNumber)) candidates.push(targetOrderNumber);

  try {
    const logs = await sql`
      SELECT payload FROM payment_logs
      WHERE (order_id = ${order?.id || null} OR order_number = ${targetOrderNumber} OR order_number = ${rawIdString})
        AND (provider LIKE 'midtrans%' OR provider = 'midtrans')
      ORDER BY created_at DESC
      LIMIT 20
    `;

    for (const log of logs) {
      const payloadObj = typeof log.payload === "string" ? JSON.parse(log.payload) : log.payload;
      const logAttemptId = payloadObj?.transaction_details?.order_id || payloadObj?.order_id;
      if (logAttemptId && !candidates.includes(logAttemptId)) {
        candidates.unshift(logAttemptId); // prioritaskan attempt terbaru dari log
      }
    }
  } catch (e) {
    console.error("[check-status] Error reading payment logs:", e);
  }

  // 4. Query status ke API Midtrans untuk setiap kandidat
  let latestMidtransData: any = null;
  let isSettled = false;
  let isCancelled = false;

  for (const candidateId of candidates) {
    try {
      const res = await checkMidtransTransactionStatus(candidateId);
      if (res.ok && res.data?.transaction_status) {
        latestMidtransData = res.data;

        // Catat ke payment_logs
        await sql`
          INSERT INTO payment_logs (order_id, order_number, direction, provider, payload, http_status)
          VALUES (${order?.id || null}, ${targetOrderNumber}, 'status_check', 'midtrans', ${JSON.stringify(res.data)}, ${res.httpStatus})
        `;

        const tStatus = res.data.transaction_status;
        const fStatus = res.data.fraud_status;

        if (tStatus === "settlement" || (tStatus === "capture" && fStatus === "accept")) {
          isSettled = true;
          break;
        }

        if (tStatus === "cancel" || tStatus === "expire" || tStatus === "deny") {
          isCancelled = true;
        }
      }
    } catch (err) {
      console.warn(`[check-status] Error checking attempt ${candidateId}:`, err);
    }
  }

  // 5. Jika transaksi sudah lunas di Midtrans, sinkronkan / commit ke database
  if (isSettled) {
    if (!order) {
      order = await commitPaidOrderFromDraft(targetOrderNumber);
    } else {
      await sql`
        UPDATE orders
        SET payment_status = 'paid', paid_at = NOW(), order_status = 'confirmed'
        WHERE id = ${order.id}
      `;
      await sql`
        INSERT INTO order_status_logs (order_id, status)
        VALUES (${order.id}, 'confirmed')
      `;
    }

    if (order) {
      // Recalculate loyalty
      const loyaltyResult = await recalculateLoyaltyTier(
        order.customer_id,
        order.id,
        order.total
      );

      // Kirim notifikasi
      const target = order.customer_phone || order.customer_email;
      if (target) {
        await sendNotification(
          "order_paid",
          target,
          {
            customer_name: order.customer_name || "Pelanggan",
            order_number: order.order_number,
          },
          { orderId: order.id, customerId: order.customer_id }
        );
      }

      return NextResponse.json({
        status: "ok",
        paid: true,
        orderId: order.id,
        orderNumber: order.order_number,
        paymentStatus: "paid",
        orderStatus: "confirmed",
        loyalty: loyaltyResult,
        midtransData: latestMidtransData,
      });
    }
  }

  // 6. Jika transaksi dibatalkan / kedaluwarsa di Midtrans
  if (isCancelled) {
    if (order && order.order_status !== "cancelled") {
      await sql`
        UPDATE orders
        SET order_status = 'cancelled'
        WHERE id = ${order.id}
      `;
      await sql`
        INSERT INTO order_status_logs (order_id, status)
        VALUES (${order.id}, 'cancelled')
      `;
    }
    await sql`DELETE FROM payment_drafts WHERE order_number = ${targetOrderNumber}`;

    return NextResponse.json({
      status: "ok",
      paid: false,
      paymentStatus: "unpaid",
      orderStatus: "cancelled",
      midtransData: latestMidtransData,
    });
  }

  // 7. Masih pending atau belum dibayar
  return NextResponse.json({
    status: "ok",
    paid: false,
    orderId: order?.id,
    orderNumber: targetOrderNumber,
    paymentStatus: order?.payment_status || "unpaid",
    orderStatus: order?.order_status || "draft",
    transactionStatus: latestMidtransData?.transaction_status || "pending",
    message: latestMidtransData ? "Menunggu pembayaran dari pelanggan" : "Transaksi belum ditemukan di Midtrans",
  });
}

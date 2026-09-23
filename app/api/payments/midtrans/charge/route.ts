import { NextResponse } from "next/server";
import { sql } from "@/src/db/client";
import { requireCustomer } from "@/lib/auth-middleware";
import { createDirectPaymentCharge } from "@/lib/midtrans";

/**
 * POST /api/payments/midtrans/charge
 * body: { orderId, bank? }
 *
 * Buat transaksi pembayaran Midtrans dengan dukungan Direct Core API (GoPay, ShopeePay, Bank VA, QRIS)
 * serta Snap fallback. Mengembalikan parameter deeplinkUrl, qrUrl, vaNumber, snapToken dsb.
 */
export async function POST(req: Request) {
  const auth = await requireCustomer(req);
  if ("error" in auth) return auth.error;

  const body = await req.json().catch(() => null);
  const orderId = body?.orderId;
  const bank = body?.bank;
  if (!orderId)
    return NextResponse.json({ error: "orderId wajib diisi" }, { status: 400 });

  const orders = await sql`
    select o.*, c.email as customer_email, c.phone as customer_phone, pm.code as payment_method_code
    from orders o
    join customers c on c.id = o.customer_id
    left join payment_methods pm on pm.id = o.payment_method_id
    where o.id = ${orderId} and o.customer_id = ${auth.payload.sub}
    limit 1
  `;
  const order = orders[0];
  if (!order)
    return NextResponse.json(
      { error: "Order tidak ditemukan" },
      { status: 404 },
    );
  if (order.payment_status === "paid") {
    return NextResponse.json(
      { error: "Order ini sudah dibayar" },
      { status: 409 },
    );
  }

  try {
    const charge = await createDirectPaymentCharge({
      id: order.id,
      orderNumber: order.order_number,
      total: order.total,
      customerEmail: order.customer_email,
      customerPhone: order.customer_phone,
      paymentMethodCode: order.payment_method_code,
      bank: bank,
    });

    return NextResponse.json({
      orderId: charge.orderId,
      orderNumber: charge.orderNumber,
      paymentType: charge.paymentType,
      snapToken: charge.snapToken,
      redirectUrl: charge.redirectUrl,
      deeplinkUrl: charge.deeplinkUrl,
      qrUrl: charge.qrUrl,
      qrString: charge.qrString,
      vaNumber: charge.vaNumber,
      bankName: charge.bankName,
      billerCode: charge.billerCode,
      billKey: charge.billKey,
      expiryTime: charge.expiryTime,
    });
  } catch (err) {
    return NextResponse.json(
      { error: String(err instanceof Error ? err.message : err) },
      { status: 502 },
    );
  }
}


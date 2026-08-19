import { NextResponse } from "next/server";
import { sql } from "@/src/db/client";
import { requireCustomer } from "@/lib/auth-middleware";
import { createSnapTransaction } from "@/lib/midtrans";

/**
 * POST /api/payments/midtrans/charge
 * body: { orderId }
 *
 * Buat transaksi Snap ke Midtrans SANDBOX (bukan production — lihat lib/midtrans.ts).
 * Mobile app buka snap_token/redirect_url di WebView, lalu bayar pakai
 * data dummy sandbox Midtrans (nomor kartu test, dsb — lihat docs/navigation-flow.md
 * untuk daftar data dummy resmi Midtrans).
 */
export async function POST(req: Request) {
  const auth = await requireCustomer(req);
  if ("error" in auth) return auth.error;

  const body = await req.json().catch(() => null);
  const orderId = body?.orderId;
  if (!orderId)
    return NextResponse.json({ error: "orderId wajib diisi" }, { status: 400 });

  const orders = await sql`
    select o.*, c.email as customer_email, c.phone as customer_phone
    from orders o
    join customers c on c.id = o.customer_id
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
    const snap = await createSnapTransaction({
      id: order.id,
      orderNumber: order.order_number,
      total: order.total,
      customerEmail: order.customer_email,
      customerPhone: order.customer_phone,
    });
    return NextResponse.json({
      snapToken: snap.token,
      redirectUrl: snap.redirect_url,
    });
  } catch (err) {
    return NextResponse.json(
      { error: String(err instanceof Error ? err.message : err) },
      { status: 502 },
    );
  }
}

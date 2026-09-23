import { NextResponse } from "next/server";
import { requireCustomer } from "@/lib/auth-middleware";
import { createPaymentDraftSession } from "@/lib/checkout";

/**
 * POST /api/payments/checkout-session
 * Customer Only — Memulai sesi checkout dan direct payment charge tanpa membuat record pesanan unpaid di tabel orders.
 */
export async function POST(req: Request) {
  const auth = await requireCustomer(req);
  if ("error" in auth) return auth.error;
  const customerId = auth.payload.sub;

  const body = await req.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ error: "Request body tidak valid" }, { status: 400 });
  }

  try {
    const result = await createPaymentDraftSession({
      customerId,
      pin: body.pin,
      outletId: body.outletId,
      fulfillmentType: body.fulfillmentType,
      deliveryAddress: body.deliveryAddress,
      deliveryLatitude: body.deliveryLatitude,
      deliveryLongitude: body.deliveryLongitude,
      paymentMethodId: body.paymentMethodId,
      voucherCode: body.voucherCode,
      bank: body.bank,
      items: body.items,
    });

    return NextResponse.json(result, { status: 201 });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "Gagal memproses sesi pembayaran" },
      { status: 400 }
    );
  }
}

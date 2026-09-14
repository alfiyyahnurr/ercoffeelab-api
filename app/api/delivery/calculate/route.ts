import { NextResponse } from "next/server";
import { getDeliveryQuote } from "@/lib/delivery";

/**
 * GET /api/delivery/calculate?outletId=1&latitude=-6.9175&longitude=107.6191
 *
 * Calculates distance, tiered delivery fee, and deliverability status in real-time.
 */
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const outletId = searchParams.get("outletId");
    const latStr = searchParams.get("latitude") || searchParams.get("lat");
    const lngStr = searchParams.get("longitude") || searchParams.get("lng");

    if (!outletId) {
      return NextResponse.json(
        { error: "Parameter outletId wajib diisi" },
        { status: 400 },
      );
    }

    if (!latStr || !lngStr) {
      return NextResponse.json(
        { error: "Parameter latitude dan longitude koordinat pelanggan wajib diisi" },
        { status: 400 },
      );
    }

    const latitude = parseFloat(latStr);
    const longitude = parseFloat(lngStr);

    if (isNaN(latitude) || isNaN(longitude)) {
      return NextResponse.json(
        { error: "Format latitude atau longitude tidak valid" },
        { status: 400 },
      );
    }

    const quote = await getDeliveryQuote(outletId, latitude, longitude);

    return NextResponse.json(quote);
  } catch (err: any) {
    console.error("Delivery calculate error:", err);
    return NextResponse.json(
      { error: err.message || "Gagal menghitung biaya delivery" },
      { status: 500 },
    );
  }
}

import { NextResponse } from "next/server";
import { sql } from "@/src/db/client";
import { requireStaff } from "@/lib/auth-middleware";
import { formatOutlet } from "../utils";

/**
 * PATCH /api/outlets/:id
 * Super Admin or assigned Outlet Admin — Update data outlet
 */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const auth = await requireStaff(req, ["super_admin", "outlet_admin"]);
    if ("error" in auth) return auth.error;

    const outletId = Number(id);
    if (isNaN(outletId)) {
      return NextResponse.json({ error: "ID outlet tidak valid" }, { status: 400 });
    }

    // outlet_admin can only manage their own outlet
    if (auth.payload.role === "outlet_admin") {
      if (auth.payload.outletId !== outletId) {
        return NextResponse.json(
          { error: "Admin outlet hanya dapat mengelola data cabangnya sendiri" },
          { status: 403 },
        );
      }
    }

    const existingRows = await sql`SELECT * FROM outlets WHERE id = ${outletId}`;
    const existing = existingRows[0];

    if (!existing) {
      return NextResponse.json({ error: "Outlet tidak ditemukan" }, { status: 404 });
    }

    const body = await req.json().catch(() => null);
    if (!body || Object.keys(body).length === 0) {
      return NextResponse.json({ error: "Data update tidak boleh kosong" }, { status: 400 });
    }

    const name = body.name !== undefined ? body.name.trim() : existing.name;
    const address = body.address !== undefined ? body.address.trim() : existing.address;
    const phone = body.phone !== undefined ? (body.phone ? String(body.phone).trim() : null) : existing.phone;
    const openHour = body.openHour !== undefined ? body.openHour : existing.open_hour;
    const closeHour = body.closeHour !== undefined ? body.closeHour : existing.close_hour;
    const isOpen = body.isOpen !== undefined ? Boolean(body.isOpen) : existing.is_open;
    const deliveryFee = body.deliveryFee !== undefined ? Number(body.deliveryFee) : (existing.delivery_fee ?? 10000);
    const maxDeliveryDistanceKm = body.maxDeliveryDistanceKm !== undefined ? Number(body.maxDeliveryDistanceKm) : (existing.max_delivery_distance_km ?? 10);
    const isDeliveryEnabled = body.isDeliveryEnabled !== undefined ? Boolean(body.isDeliveryEnabled) : (existing.is_delivery_enabled ?? true);
    const latitude =
      body.latitude !== undefined
        ? body.latitude === null
          ? null
          : Number(body.latitude)
        : existing.latitude;
    const longitude =
      body.longitude !== undefined
        ? body.longitude === null
          ? null
          : Number(body.longitude)
        : existing.longitude;

    if (!name || !address) {
      return NextResponse.json(
        { error: "name dan address tidak boleh kosong" },
        { status: 400 },
      );
    }

    const updatedRows = await sql`
      UPDATE outlets
      SET 
        name = ${name},
        address = ${address},
        phone = ${phone},
        open_hour = ${openHour},
        close_hour = ${closeHour},
        is_open = ${isOpen},
        latitude = ${latitude},
        longitude = ${longitude},
        delivery_fee = ${deliveryFee},
        max_delivery_distance_km = ${maxDeliveryDistanceKm},
        is_delivery_enabled = ${isDeliveryEnabled}
      WHERE id = ${outletId}
      RETURNING *
    `;

    return NextResponse.json(formatOutlet(updatedRows[0]));
  } catch (err: any) {
    console.error("PATCH /api/outlets/:id error:", err);
    return NextResponse.json(
      { error: err?.message || "Gagal memperbarui data outlet" },
      { status: 500 },
    );
  }
}

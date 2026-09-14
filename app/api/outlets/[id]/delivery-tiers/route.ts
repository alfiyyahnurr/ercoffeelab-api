import { NextResponse } from "next/server";
import { sql } from "@/src/db/client";
import { requireStaff } from "@/lib/auth-middleware";

/**
 * GET /api/outlets/:id/delivery-tiers
 * Retrieve delivery tiers for a specific outlet (or global tiers if id is 'global' or '0')
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const isGlobal = id === "global" || id === "0";

  let tiers;
  if (isGlobal) {
    tiers = await sql`
      SELECT id, outlet_id, min_distance_km, max_distance_km, fee, is_active, created_at
      FROM delivery_tiers
      WHERE outlet_id IS NULL
      ORDER BY min_distance_km ASC
    `;
  } else {
    // Check if outlet has custom tiers
    const outletTiers = await sql`
      SELECT id, outlet_id, min_distance_km, max_distance_km, fee, is_active, created_at
      FROM delivery_tiers
      WHERE outlet_id = ${id}
      ORDER BY min_distance_km ASC
    `;

    if (outletTiers.length > 0) {
      tiers = outletTiers;
    } else {
      // Fallback to global tiers
      tiers = await sql`
        SELECT id, outlet_id, min_distance_km, max_distance_km, fee, is_active, created_at
        FROM delivery_tiers
        WHERE outlet_id IS NULL
        ORDER BY min_distance_km ASC
      `;
    }
  }

  const formatted = tiers.map((t) => ({
    id: Number(t.id),
    outletId: t.outlet_id ? Number(t.outlet_id) : null,
    minDistanceKm: Number(t.min_distance_km),
    maxDistanceKm: Number(t.max_distance_km),
    fee: Number(t.fee),
    isActive: Boolean(t.is_active),
    createdAt: t.created_at ? new Date(t.created_at).toISOString() : null,
  }));

  return NextResponse.json({ data: formatted });
}

/**
 * POST /api/outlets/:id/delivery-tiers
 * Add a new delivery tier rule
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const auth = await requireStaff(req, ["super_admin", "outlet_admin"]);
  if ("error" in auth) return auth.error;

  const isGlobal = id === "global" || id === "0";
  const outletId = isGlobal ? null : Number(id);

  // Scoped authorization for outlet_admin
  if (auth.payload.role === "outlet_admin") {
    if (isGlobal || auth.payload.outletId !== outletId) {
      return NextResponse.json(
        { error: "Admin outlet hanya dapat mengelola tier cabangnya sendiri" },
        { status: 403 },
      );
    }
  }

  const body = await req.json().catch(() => null);
  const minDistanceKm = parseFloat(body?.minDistanceKm ?? "0");
  const maxDistanceKm = parseFloat(body?.maxDistanceKm);
  const fee = parseInt(body?.fee, 10);
  const isActive = body?.isActive !== undefined ? Boolean(body.isActive) : true;

  if (isNaN(minDistanceKm) || isNaN(maxDistanceKm) || isNaN(fee)) {
    return NextResponse.json(
      { error: "minDistanceKm, maxDistanceKm, dan fee wajib berupa angka valid" },
      { status: 400 },
    );
  }

  if (maxDistanceKm <= minDistanceKm) {
    return NextResponse.json(
      { error: "maxDistanceKm harus lebih besar dari minDistanceKm" },
      { status: 400 },
    );
  }

  const inserted = await sql`
    INSERT INTO delivery_tiers (outlet_id, min_distance_km, max_distance_km, fee, is_active)
    VALUES (${outletId}, ${minDistanceKm}, ${maxDistanceKm}, ${fee}, ${isActive})
    RETURNING *
  `;

  const row = inserted[0];
  return NextResponse.json(
    {
      id: Number(row.id),
      outletId: row.outlet_id ? Number(row.outlet_id) : null,
      minDistanceKm: Number(row.min_distance_km),
      maxDistanceKm: Number(row.max_distance_km),
      fee: Number(row.fee),
      isActive: Boolean(row.is_active),
      createdAt: row.created_at ? new Date(row.created_at).toISOString() : null,
    },
    { status: 201 },
  );
}

/**
 * PUT /api/outlets/:id/delivery-tiers
 * Bulk replace/update all tiers for an outlet (or global)
 */
export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const auth = await requireStaff(req, ["super_admin", "outlet_admin"]);
  if ("error" in auth) return auth.error;

  const isGlobal = id === "global" || id === "0";
  const outletId = isGlobal ? null : Number(id);

  if (auth.payload.role === "outlet_admin") {
    if (isGlobal || auth.payload.outletId !== outletId) {
      return NextResponse.json(
        { error: "Admin outlet hanya dapat mengelola tier cabangnya sendiri" },
        { status: 403 },
      );
    }
  }

  const body = await req.json().catch(() => null);
  const tiers = body?.tiers;
  const maxDeliveryDistanceKm = body?.maxDeliveryDistanceKm;
  const isDeliveryEnabled = body?.isDeliveryEnabled;

  // Optional: update outlet settings directly
  if (!isGlobal && outletId) {
    if (maxDeliveryDistanceKm !== undefined || isDeliveryEnabled !== undefined) {
      await sql`
        UPDATE outlets
        SET 
          max_delivery_distance_km = coalesce(${maxDeliveryDistanceKm !== undefined ? Number(maxDeliveryDistanceKm) : null}, max_delivery_distance_km),
          is_delivery_enabled = coalesce(${isDeliveryEnabled !== undefined ? Boolean(isDeliveryEnabled) : null}, is_delivery_enabled)
        WHERE id = ${outletId}
      `;
    }
  }

  if (Array.isArray(tiers)) {
    // Delete existing tiers for this outlet
    if (isGlobal) {
      await sql`DELETE FROM delivery_tiers WHERE outlet_id IS NULL`;
    } else {
      await sql`DELETE FROM delivery_tiers WHERE outlet_id = ${outletId}`;
    }

    // Insert new tiers
    for (const t of tiers) {
      const min = parseFloat(t.minDistanceKm ?? 0);
      const max = parseFloat(t.maxDistanceKm);
      const fee = parseInt(t.fee, 10);
      const active = t.isActive !== undefined ? Boolean(t.isActive) : true;

      if (!isNaN(min) && !isNaN(max) && !isNaN(fee) && max > min) {
        await sql`
          INSERT INTO delivery_tiers (outlet_id, min_distance_km, max_distance_km, fee, is_active)
          VALUES (${outletId}, ${min}, ${max}, ${fee}, ${active})
        `;
      }
    }
  }

  // Return updated tiers
  const updated = isGlobal
    ? await sql`SELECT * FROM delivery_tiers WHERE outlet_id IS NULL ORDER BY min_distance_km ASC`
    : await sql`SELECT * FROM delivery_tiers WHERE outlet_id = ${outletId} ORDER BY min_distance_km ASC`;

  const formatted = updated.map((t) => ({
    id: Number(t.id),
    outletId: t.outlet_id ? Number(t.outlet_id) : null,
    minDistanceKm: Number(t.min_distance_km),
    maxDistanceKm: Number(t.max_distance_km),
    fee: Number(t.fee),
    isActive: Boolean(t.is_active),
    createdAt: t.created_at ? new Date(t.created_at).toISOString() : null,
  }));

  return NextResponse.json({ data: formatted });
}

/**
 * DELETE /api/outlets/:id/delivery-tiers?tierId=123
 */
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const auth = await requireStaff(req, ["super_admin", "outlet_admin"]);
  if ("error" in auth) return auth.error;

  const { searchParams } = new URL(req.url);
  const tierId = searchParams.get("tierId");

  if (!tierId) {
    return NextResponse.json({ error: "Parameter tierId wajib diisi" }, { status: 400 });
  }

  const isGlobal = id === "global" || id === "0";
  const outletId = isGlobal ? null : Number(id);

  if (auth.payload.role === "outlet_admin") {
    if (isGlobal || auth.payload.outletId !== outletId) {
      return NextResponse.json(
        { error: "Admin outlet hanya dapat mengelola tier cabangnya sendiri" },
        { status: 403 },
      );
    }
  }

  await sql`DELETE FROM delivery_tiers WHERE id = ${tierId}`;

  return NextResponse.json({ message: "Tier delivery berhasil dihapus" });
}

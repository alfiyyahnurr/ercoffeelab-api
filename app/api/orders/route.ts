import { NextResponse } from "next/server";
import { sql } from "@/src/db/client";
import { requireCustomer, requireCustomerOrStaff } from "@/lib/auth-middleware";
import { validateVoucherCode } from "@/lib/vouchers";
import { formatOrder } from "./utils";

/**
 * POST /api/orders
 * Customer only — Checkout pesanan baru.
 * SERVER-SIDE PRICE RECALCULATION: Menghitung ulang harga dari database, tidak percaya client.
 */
export async function POST(req: Request) {
  const auth = await requireCustomer(req);
  if ("error" in auth) return auth.error;
  const customerId = auth.payload.sub;

  const body = await req.json().catch(() => null);
  const outletId = body?.outletId;
  const fulfillmentType = body?.fulfillmentType;
  const deliveryAddress = body?.deliveryAddress?.trim();
  const paymentMethodId = body?.paymentMethodId;
  const voucherCode = body?.voucherCode;
  const items = body?.items;

  if (!outletId) {
    return NextResponse.json({ error: "outletId wajib diisi" }, { status: 400 });
  }

  if (!fulfillmentType || !["pickup", "delivery"].includes(fulfillmentType)) {
    return NextResponse.json(
      { error: "fulfillmentType wajib 'pickup' atau 'delivery'" },
      { status: 400 },
    );
  }

  if (fulfillmentType === "delivery" && !deliveryAddress) {
    return NextResponse.json(
      { error: "deliveryAddress wajib diisi untuk jenis pesanan delivery" },
      { status: 400 },
    );
  }

  if (!paymentMethodId) {
    return NextResponse.json({ error: "paymentMethodId wajib diisi" }, { status: 400 });
  }

  if (!Array.isArray(items) || items.length === 0) {
    return NextResponse.json(
      { error: "items wajib diisi minimal 1 produk" },
      { status: 400 },
    );
  }

  // Cek keberadaan outlet
  const outletRows = await sql`SELECT id, name FROM outlets WHERE id = ${outletId}`;
  if (!outletRows[0]) {
    return NextResponse.json({ error: "Outlet tidak ditemukan" }, { status: 400 });
  }

  // Cek metode pembayaran
  const paymentMethodRows = await sql`
    SELECT id, code, display_name FROM payment_methods
    WHERE id = ${paymentMethodId} AND is_active = true
  `;
  if (!paymentMethodRows[0]) {
    return NextResponse.json(
      { error: "Metode pembayaran tidak valid atau tidak aktif" },
      { status: 400 },
    );
  }

  let subtotal = 0;
  const processedItems: Array<{
    productId: string;
    productNameSnapshot: string;
    qty: number;
    size: string | null;
    temperature: string | null;
    sugar: string | null;
    ice: string | null;
    unitPrice: number;
    addons: Array<{ name: string; price: number }>;
  }> = [];

  for (const item of items) {
    const productId = item.productId;
    const qty = Number(item.qty);

    if (!productId || typeof productId !== "string") {
      return NextResponse.json({ error: "productId wajib diisi" }, { status: 400 });
    }
    if (isNaN(qty) || qty <= 0) {
      return NextResponse.json({ error: "qty harus angka lebih besar dari 0" }, { status: 400 });
    }

    // Query produk + ketersediaan di outlet
    const productRows = await sql`
      SELECT 
        p.id,
        p.name,
        p.base_price,
        po.is_available,
        po.price_override
      FROM products p
      LEFT JOIN product_outlets po ON po.product_id = p.id AND po.outlet_id = ${outletId}
      WHERE p.id = ${productId}
    `;

    const product = productRows[0];
    if (!product) {
      return NextResponse.json(
        { error: `Produk dengan ID ${productId} tidak ditemukan` },
        { status: 400 },
      );
    }

    if (!product.is_available) {
      return NextResponse.json(
        { error: `Produk '${product.name}' tidak tersedia di outlet ini` },
        { status: 400 },
      );
    }

    const baseOrOverridePrice =
      product.price_override !== null && product.price_override !== undefined
        ? Number(product.price_override)
        : Number(product.base_price);

    // Validasi addons dari database
    let addonExtraSum = 0;
    const processedAddons: Array<{ name: string; price: number }> = [];

    if (Array.isArray(item.addons) && item.addons.length > 0) {
      const dbAddonsRows = await sql`
        SELECT name, extra_price FROM product_addons WHERE product_id = ${productId}
      `;
      const dbAddonsMap = new Map<string, number>();
      for (const row of dbAddonsRows) {
        dbAddonsMap.set(row.name.toLowerCase(), Number(row.extra_price));
      }

      for (const addonInput of item.addons) {
        const addonName = addonInput.name?.trim();
        if (addonName) {
          const dbExtraPrice = dbAddonsMap.get(addonName.toLowerCase());
          if (dbExtraPrice !== undefined) {
            addonExtraSum += dbExtraPrice;
            processedAddons.push({ name: addonName, price: dbExtraPrice });
          }
        }
      }
    }

    const unitPrice = baseOrOverridePrice + addonExtraSum;
    subtotal += unitPrice * qty;

    processedItems.push({
      productId: product.id,
      productNameSnapshot: product.name,
      qty,
      size: item.size ?? null,
      temperature: item.temperature ?? null,
      sugar: item.sugar ?? null,
      ice: item.ice ?? null,
      unitPrice,
      addons: processedAddons,
    });
  }

  // Hitung voucher & discount
  let discount = 0;
  let voucherId: number | null = null;


  if (voucherCode && typeof voucherCode === "string" && voucherCode.trim()) {
    const voucherRes = await validateVoucherCode(voucherCode, subtotal, customerId);
    if (!voucherRes.valid) {
      return NextResponse.json({ error: voucherRes.error }, { status: 400 });
    }
    discount = voucherRes.discount;
    voucherId = voucherRes.voucher.id;
  }

  const serviceFee = 0;
  const total = Math.max(0, subtotal - discount + serviceFee);

  // Generate orderNumber unik format ERC-YYYYMMDD-XXXX
  const now = new Date();
  const dateStr =
    now.getFullYear().toString() +
    (now.getMonth() + 1).toString().padStart(2, "0") +
    now.getDate().toString().padStart(2, "0");
  const randomSuffix = Math.floor(1000 + Math.random() * 9000).toString();
  const orderNumber = `ERC-${dateStr}-${randomSuffix}`;

  // Insert parent order
  const orderRows = await sql`
    INSERT INTO orders (
      order_number,
      customer_id,
      outlet_id,
      fulfillment_type,
      delivery_address,
      payment_method_id,
      subtotal,
      discount,
      voucher_id,
      service_fee,
      total,
      payment_status,
      order_status
    )
    VALUES (
      ${orderNumber},
      ${customerId},
      ${outletId},
      ${fulfillmentType},
      ${fulfillmentType === "delivery" ? deliveryAddress : null},
      ${paymentMethodId},
      ${subtotal},
      ${discount},
      ${voucherId},
      ${serviceFee},
      ${total},
      'unpaid',
      'checkout'
    )
    RETURNING *
  `;

  const newOrder = orderRows[0];

  // Insert order_details (child)
  const createdDetails: any[] = [];
  for (const item of processedItems) {
    const detailRows = await sql`
      INSERT INTO order_details (
        order_id,
        product_id,
        product_name_snapshot,
        qty,
        size,
        temperature,
        sugar,
        ice,
        unit_price,
        addons
      )
      VALUES (
        ${newOrder.id},
        ${item.productId},
        ${item.productNameSnapshot},
        ${item.qty},
        ${item.size},
        ${item.temperature},
        ${item.sugar},
        ${item.ice},
        ${item.unitPrice},
        ${JSON.stringify(item.addons)}
      )
      RETURNING *
    `;
    createdDetails.push(detailRows[0]);
  }

  // Insert outlet_order_alerts (trigger admin alert)
  await sql`
    INSERT INTO outlet_order_alerts (outlet_id, order_id, is_acknowledged)
    VALUES (${outletId}, ${newOrder.id}, false)
  `;

  // Insert status log awal
  await sql`
    INSERT INTO order_status_logs (order_id, status, changed_by_staff_id)
    VALUES (${newOrder.id}, 'checkout', null)
  `;

  // Catat klaim voucher jika ada
  if (voucherId) {
    await sql`
      INSERT INTO customer_vouchers (customer_id, voucher_id, used_at)
      VALUES (${customerId}, ${voucherId}, NOW())
      ON CONFLICT (customer_id, voucher_id)
      DO UPDATE SET used_at = NOW()
    `;
  }

  // Ambil nama customer & outlet untuk response
  const customerRows = await sql`SELECT full_name, phone FROM customers WHERE id = ${customerId}`;
  const fullOrder = {
    ...newOrder,
    customer_name: customerRows[0]?.full_name ?? null,
    customer_phone: customerRows[0]?.phone ?? null,
    outlet_name: outletRows[0]?.name ?? null,
    payment_method_name: paymentMethodRows[0]?.display_name ?? null,
  };

  return NextResponse.json(formatOrder(fullOrder, createdDetails, []), { status: 201 });
}

/**
 * GET /api/orders
 * Customer ATAU Staff — Mengambil daftar pesanan.
 * - Customer: WHERE customer_id = payload.sub
 * - Staff outlet_admin: WHERE outlet_id = payload.outletId
 * - Staff super_admin: Semua order
 * Query params opsional: ?outletId=&status=
 */
export async function GET(req: Request) {
  const auth = await requireCustomerOrStaff(req);
  if ("error" in auth) return auth.error;

  const { searchParams } = new URL(req.url);
  const filterOutletParam = searchParams.get("outletId");
  const filterStatusParam = searchParams.get("status");

  const customerFilter = auth.userType === "customer" ? Number(auth.payload.sub) : null;
  const staffOutletFilter =
    auth.userType === "staff"
      ? auth.payload.role === "outlet_admin"
        ? Number(auth.payload.outletId)
        : filterOutletParam ? Number(filterOutletParam) : null
      : null;
  const statusFilter = filterStatusParam?.trim() || null;

  const rows = await sql`
    SELECT 
      o.id,
      o.order_number,
      o.customer_id,
      c.full_name AS customer_name,
      c.phone AS customer_phone,
      o.outlet_id,
      out.name AS outlet_name,
      o.fulfillment_type,
      o.delivery_address,
      o.payment_method_id,
      pm.display_name AS payment_method_name,
      o.subtotal,
      o.discount,
      o.voucher_id,
      o.service_fee,
      o.total,
      o.payment_status,
      o.order_status,
      o.paid_at,
      o.created_at
    FROM orders o
    LEFT JOIN customers c ON c.id = o.customer_id
    LEFT JOIN outlets out ON out.id = o.outlet_id
    LEFT JOIN payment_methods pm ON pm.id = o.payment_method_id
    WHERE (${customerFilter}::bigint IS NULL OR o.customer_id = ${customerFilter}::bigint)
      AND (${staffOutletFilter}::bigint IS NULL OR o.outlet_id = ${staffOutletFilter}::bigint)
      AND (${statusFilter}::text IS NULL OR o.order_status = ${statusFilter}::text)
    ORDER BY o.created_at DESC
  `;


  const data = rows.map((row: any) => formatOrder(row, [], []));
  return NextResponse.json({ data });
}


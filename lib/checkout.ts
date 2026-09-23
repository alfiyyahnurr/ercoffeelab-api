import crypto from "crypto";
import { sql } from "@/src/db/client";
import { validateVoucherCode } from "@/lib/vouchers";
import { getDeliveryQuote } from "@/lib/delivery";
import { createDirectPaymentCharge } from "@/lib/midtrans";
import { recalculateLoyaltyTier } from "@/lib/loyalty";
import { sendNotification } from "@/lib/notifications";

export interface CreateCheckoutSessionInput {
  customerId: string | number;
  pin: string;
  outletId: number | string;
  fulfillmentType: "pickup" | "delivery";
  deliveryAddress?: string | null;
  deliveryLatitude?: number | null;
  deliveryLongitude?: number | null;
  paymentMethodId: number | string;
  voucherCode?: string | null;
  bank?: string | null;
  items: Array<{
    productId: string;
    qty: number;
    size?: string | null;
    temperature?: string | null;
    sugar?: string | null;
    ice?: string | null;
    addons?: Array<{ name: string; price: number }>;
  }>;
}

/**
 * Validasi dan inisiasi sesi checkout draft tanpa mengotori tabel orders.
 */
export async function createPaymentDraftSession(input: CreateCheckoutSessionInput) {
  const { customerId, pin, outletId, fulfillmentType, items, paymentMethodId, voucherCode, bank } = input;

  // 1. Validasi PIN Keamanan 6 Digit
  if (!pin || !/^\d{6}$/.test(pin.trim())) {
    throw new Error("PIN keamanan wajib diisi 6 digit angka untuk memproses transaksi");
  }

  const customerRows = await sql`SELECT pin, email, phone, full_name FROM customers WHERE id = ${customerId} LIMIT 1`;
  const customer = customerRows[0];
  if (!customer?.pin) {
    throw new Error("Anda belum membuat PIN keamanan. Silakan buat PIN terlebih dahulu di menu Akun Saya.");
  }

  const secret = process.env.JWT_SECRET || "ercoffeelab-secret-key";
  const inputHash = crypto.createHmac("sha256", secret).update(pin.trim()).digest("hex");
  if (inputHash !== customer.pin) {
    throw new Error("PIN keamanan yang Anda masukkan salah. Transaksi dibatalkan.");
  }

  // 2. Validasi Outlet & Metode Pembayaran
  const outletRows = await sql`SELECT id, name, delivery_fee FROM outlets WHERE id = ${outletId} LIMIT 1`;
  const outlet = outletRows[0];
  if (!outlet) {
    throw new Error("Outlet tidak ditemukan");
  }

  const paymentMethodRows = await sql`
    SELECT id, code, display_name FROM payment_methods
    WHERE id = ${paymentMethodId} AND is_active = true
    LIMIT 1
  `;
  const paymentMethod = paymentMethodRows[0];
  if (!paymentMethod) {
    throw new Error("Metode pembayaran tidak valid atau tidak aktif");
  }

  if (!Array.isArray(items) || items.length === 0) {
    throw new Error("items wajib diisi minimal 1 produk");
  }

  // 3. Recalculate Harga Server-side (Tidak Percaya Client)
  let subtotal = 0;
  const processedItems: any[] = [];

  for (const item of items) {
    const productId = item.productId;
    const qty = Number(item.qty);

    if (!productId || isNaN(qty) || qty <= 0) {
      throw new Error("Item produk atau kuantitas tidak valid");
    }

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
      throw new Error(`Produk dengan ID ${productId} tidak ditemukan`);
    }
    if (!product.is_available) {
      throw new Error(`Produk '${product.name}' tidak tersedia di outlet ini`);
    }

    const baseOrOverridePrice =
      product.price_override !== null && product.price_override !== undefined
        ? Number(product.price_override)
        : Number(product.base_price);

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

  // 4. Voucher Discount
  let discount = 0;
  let voucherId: number | null = null;
  if (voucherCode && voucherCode.trim()) {
    const voucherRes = await validateVoucherCode(voucherCode.trim(), subtotal, customerId);
    if (!voucherRes.valid) {
      throw new Error(voucherRes.error);
    }
    discount = voucherRes.discount;
    voucherId = voucherRes.voucher.id;
  }

  // 5. Delivery Ongkir
  let deliveryFee = 0;
  let deliveryDistanceKm: number | null = null;
  let deliveryLatitude: number | null = null;
  let deliveryLongitude: number | null = null;

  if (fulfillmentType === "delivery") {
    const rawLat = input.deliveryLatitude;
    const rawLng = input.deliveryLongitude;

    if (rawLat !== undefined && rawLng !== undefined && rawLat !== null && rawLng !== null) {
      const latNum = parseFloat(String(rawLat));
      const lngNum = parseFloat(String(rawLng));

      if (!isNaN(latNum) && !isNaN(lngNum)) {
        deliveryLatitude = latNum;
        deliveryLongitude = lngNum;

        const quote = await getDeliveryQuote(outletId, latNum, lngNum);
        if (!quote.isDeliverable) {
          throw new Error(quote.message || "Alamat pengiriman di luar jangkauan delivery cabang ini");
        }
        deliveryFee = quote.deliveryFee;
        deliveryDistanceKm = quote.distanceKm;
      }
    }

    if (deliveryFee === 0 && deliveryDistanceKm === null) {
      deliveryFee = Number(outlet.delivery_fee) || 10000;
    }
  }

  const serviceFee = 2000;
  const total = Math.max(0, subtotal - discount + serviceFee + deliveryFee);

  // 6. Generate Order Number Unik
  const now = new Date();
  const dateStr =
    now.getFullYear().toString() +
    (now.getMonth() + 1).toString().padStart(2, "0") +
    now.getDate().toString().padStart(2, "0");
  const randomSuffix = Math.floor(1000 + Math.random() * 9000).toString();
  const orderNumber = `ERC-${dateStr}-${randomSuffix}`;
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 jam batas bayar

  // 7. Simpan ke payment_drafts (Temporary Session)
  await sql`
    INSERT INTO payment_drafts (
      order_number,
      customer_id,
      outlet_id,
      fulfillment_type,
      delivery_address,
      delivery_fee,
      delivery_distance_km,
      delivery_latitude,
      delivery_longitude,
      payment_method_id,
      subtotal,
      discount,
      voucher_id,
      service_fee,
      total,
      items_json,
      expires_at
    )
    VALUES (
      ${orderNumber},
      ${customerId},
      ${outletId},
      ${fulfillmentType},
      ${fulfillmentType === "delivery" ? input.deliveryAddress ?? null : null},
      ${deliveryFee},
      ${deliveryDistanceKm},
      ${deliveryLatitude},
      ${deliveryLongitude},
      ${paymentMethodId},
      ${subtotal},
      ${discount},
      ${voucherId},
      ${serviceFee},
      ${total},
      ${JSON.stringify(processedItems)},
      ${expiresAt.toISOString()}
    )
  `;

  // 8. Request Midtrans Direct Payment Charge
  const charge = await createDirectPaymentCharge({
    id: orderNumber, // gunakan orderNumber sebagai identifier unik
    orderNumber: orderNumber,
    total: total,
    customerEmail: customer.email,
    customerPhone: customer.phone,
    paymentMethodCode: paymentMethod.code,
    bank: bank,
  });

  return {
    orderNumber,
    paymentType: charge.paymentType || paymentMethod.code,
    total,
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
  };
}

/**
 * Commit pesanan SAH ke database orders dan order_details saat pembayaran Lunas (Paid / Settlement).
 */
export async function commitPaidOrderFromDraft(orderNumber: string, simulated = false) {
  // Cek apakah order sudah pernah dicommit sebelumnya (idempotency guard)
  const existingOrders = await sql`
    SELECT * FROM orders WHERE order_number = ${orderNumber} LIMIT 1
  `;
  if (existingOrders[0]) {
    return existingOrders[0];
  }

  // Ambil draft dari payment_drafts
  const drafts = await sql`
    SELECT * FROM payment_drafts WHERE order_number = ${orderNumber} LIMIT 1
  `;
  const draft = drafts[0];
  if (!draft) {
    return null;
  }

  // 1. Insert ke tabel orders (PAID & SAH)
  const orderRows = await sql`
    INSERT INTO orders (
      order_number,
      customer_id,
      outlet_id,
      fulfillment_type,
      delivery_address,
      delivery_fee,
      delivery_distance_km,
      delivery_latitude,
      delivery_longitude,
      payment_method_id,
      subtotal,
      discount,
      voucher_id,
      service_fee,
      total,
      payment_status,
      order_status,
      paid_at
    )
    VALUES (
      ${draft.order_number},
      ${draft.customer_id},
      ${draft.outlet_id},
      ${draft.fulfillment_type},
      ${draft.delivery_address},
      ${draft.delivery_fee},
      ${draft.delivery_distance_km},
      ${draft.delivery_latitude},
      ${draft.delivery_longitude},
      ${draft.payment_method_id},
      ${draft.subtotal},
      ${draft.discount},
      ${draft.voucher_id},
      ${draft.service_fee},
      ${draft.total},
      'paid',
      'confirmed',
      now()
    )
    RETURNING *
  `;
  const newOrder = orderRows[0];

  // 2. Insert ke tabel order_details
  const items = Array.isArray(draft.items_json) ? draft.items_json : JSON.parse(draft.items_json || "[]");
  for (const item of items) {
    await sql`
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
        ${item.size ?? null},
        ${item.temperature ?? null},
        ${item.sugar ?? null},
        ${item.ice ?? null},
        ${item.unitPrice},
        ${JSON.stringify(item.addons || [])}
      )
    `;
  }

  // 3. Insert ke outlet_order_alerts (notifikasi admin outlet)
  await sql`
    INSERT INTO outlet_order_alerts (outlet_id, order_id, is_acknowledged)
    VALUES (${draft.outlet_id}, ${newOrder.id}, false)
  `;

  // 4. Insert ke order_status_logs
  await sql`
    INSERT INTO order_status_logs (order_id, status, changed_by_staff_id)
    VALUES (${newOrder.id}, 'confirmed', null)
  `;

  // 5. Catat penggunaan voucher
  if (draft.voucher_id) {
    await sql`
      INSERT INTO customer_vouchers (customer_id, voucher_id, used_at)
      VALUES (${draft.customer_id}, ${draft.voucher_id}, now())
      ON CONFLICT (customer_id, voucher_id)
      DO UPDATE SET used_at = now()
    `;
  }

  // 6. Recalculate Loyalty Points
  try {
    await recalculateLoyaltyTier(draft.customer_id, newOrder.id, Number(draft.total));
  } catch (err) {
    console.warn("[checkout] recalculateLoyaltyTier error:", err);
  }

  // 7. Kirim Notifikasi WhatsApp/Email
  try {
    const customerRows = await sql`SELECT full_name, phone, email FROM customers WHERE id = ${draft.customer_id} LIMIT 1`;
    const customer = customerRows[0];
    const target = customer?.phone || customer?.email;
    if (target) {
      await sendNotification(
        "order_paid",
        target,
        {
          customer_name: customer.full_name || "Pelanggan",
          order_number: newOrder.order_number,
        },
        { orderId: newOrder.id, customerId: draft.customer_id }
      );
    }
  } catch (err) {
    console.warn("[checkout] sendNotification error:", err);
  }

  // 8. Hapus dari payment_drafts setelah berhasil dicommit
  await sql`DELETE FROM payment_drafts WHERE id = ${draft.id}`;

  return newOrder;
}

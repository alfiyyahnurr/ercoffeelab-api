import crypto from "crypto";
import { sql } from "@/src/db/client";

const IS_PRODUCTION = process.env.MIDTRANS_IS_PRODUCTION === "true"; // default false = sandbox
const SNAP_BASE_URL = IS_PRODUCTION
  ? "https://app.midtrans.com/snap/v1"
  : "https://app.sandbox.midtrans.com/snap/v1";

const CORE_API_BASE_URL = IS_PRODUCTION
  ? "https://api.midtrans.com/v2"
  : "https://api.sandbox.midtrans.com/v2";

function serverKeyAuthHeader() {
  const serverKey = process.env.MIDTRANS_SERVER_KEY;
  if (!serverKey) throw new Error("MIDTRANS_SERVER_KEY belum diisi di .env");
  return "Basic " + Buffer.from(`${serverKey}:`).toString("base64");
}

/**
 * Pemetaan kode payment method dari database ke opsi enabled_payments Midtrans Snap.
 */
function getEnabledPayments(code?: string | null): string[] | undefined {
  if (!code) return undefined;
  const c = code.toLowerCase().trim();

  // QRIS / E-Wallet
  if (c === "qris") return ["qris", "gopay", "shopeepay", "other_qris"];
  if (c === "gopay") return ["gopay", "qris"];
  if (c === "shopeepay") return ["shopeepay", "qris"];

  // Bank Transfer / Virtual Account
  if (c === "bank_transfer" || c === "va") {
    return ["bca_va", "bni_va", "bri_va", "permata_va", "echannel", "other_va"];
  }
  if (c === "bca_va" || c === "bca") return ["bca_va"];
  if (c === "bni_va" || c === "bni") return ["bni_va"];
  if (c === "bri_va" || c === "bri") return ["bri_va"];
  if (c === "mandiri_va" || c === "echannel" || c === "mandiri") return ["echannel"];
  if (c === "permata_va" || c === "permata") return ["permata_va"];
  if (c === "cimb_va" || c === "cimb") return ["cimb_va"];

  // Credit / Debit Card
  if (c === "credit_card" || c === "cc") return ["credit_card"];

  return undefined;
}

export interface ChargeOrderInput {
  id: string | number;
  orderNumber: string;
  total: number;
  customerEmail?: string | null;
  customerPhone?: string | null;
  paymentMethodCode?: string | null;
  bank?: string | null;
}

export interface DirectPaymentResult {
  orderId: string | number;
  orderNumber: string;
  paymentType: string;
  snapToken?: string;
  redirectUrl?: string;
  deeplinkUrl?: string;
  qrUrl?: string;
  qrString?: string;
  vaNumber?: string;
  bankName?: string;
  billerCode?: string;
  billKey?: string;
  expiryTime?: string;
  rawResponse?: any;
}

/**
 * Buat transaksi direct Core API (GoPay, ShopeePay, Bank VA, QRIS) dengan fallback Snap.
 * Menghasilkan App Deeplink, QRIS code, atau Nomor Virtual Account secara presisi.
 */
export async function createDirectPaymentCharge(
  order: ChargeOrderInput
): Promise<DirectPaymentResult> {
  const uniqueAttemptOrderId = `${order.orderNumber}-${Date.now()}`;
  const code = (order.paymentMethodCode || "").toLowerCase().trim();
  const bank = (order.bank || "").toLowerCase().trim();
  const callbackUrl = `ercoffeelab://orders/${order.id}`;

  // 1. Gopay Direct Core API
  if (code === "gopay") {
    const body: Record<string, any> = {
      payment_type: "gopay",
      transaction_details: {
        order_id: uniqueAttemptOrderId,
        gross_amount: order.total,
      },
      customer_details: {
        email: order.customerEmail || undefined,
        phone: order.customerPhone || undefined,
      },
      gopay: {
        enable_callback: true,
        callback_url: callbackUrl,
      },
    };

    await logPayment(order.id, "request", "midtrans_gopay", body);
    const res = await fetch(`${CORE_API_BASE_URL}/charge`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: serverKeyAuthHeader(),
      },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    await logPayment(order.id, "response", "midtrans_gopay", data, res.status);

    if (res.ok && (data.status_code === "201" || data.status_code === "200")) {
      const actions: Array<{ name: string; url: string; method?: string }> =
        data.actions || [];
      const deeplinkAction = actions.find(
        (a) => a.name === "deeplink-redirect" || a.name === "deeplink"
      );
      const qrAction = actions.find((a) => a.name === "generate-qr-code");

      return {
        orderId: order.id,
        orderNumber: order.orderNumber,
        paymentType: "gopay",
        deeplinkUrl: deeplinkAction?.url,
        qrUrl: qrAction?.url,
        qrString: data.qr_string,
        expiryTime: data.expiry_time,
        rawResponse: data,
      };
    }
  }

  // 2. ShopeePay Direct Core API
  if (code === "shopeepay") {
    const body: Record<string, any> = {
      payment_type: "shopeepay",
      transaction_details: {
        order_id: uniqueAttemptOrderId,
        gross_amount: order.total,
      },
      customer_details: {
        email: order.customerEmail || undefined,
        phone: order.customerPhone || undefined,
      },
      shopeepay: {
        callback_url: callbackUrl,
      },
    };

    await logPayment(order.id, "request", "midtrans_shopeepay", body);
    const res = await fetch(`${CORE_API_BASE_URL}/charge`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: serverKeyAuthHeader(),
      },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    await logPayment(order.id, "response", "midtrans_shopeepay", data, res.status);

    if (res.ok && (data.status_code === "201" || data.status_code === "200")) {
      const actions: Array<{ name: string; url: string }> = data.actions || [];
      const deeplinkAction = actions.find((a) => a.name === "deeplink-redirect");

      return {
        orderId: order.id,
        orderNumber: order.orderNumber,
        paymentType: "shopeepay",
        deeplinkUrl: deeplinkAction?.url,
        expiryTime: data.expiry_time,
        rawResponse: data,
      };
    }
  }

  // 3. Bank Transfer / Virtual Account (BCA, BNI, BRI, Permata, Mandiri)
  const isVa =
    code === "bank_transfer" ||
    code === "va" ||
    code.endsWith("_va") ||
    ["bca", "bni", "bri", "permata", "mandiri", "echannel"].includes(bank || code);

  if (isVa) {
    const selectedBank = (bank || code.replace("_va", "") || "bca").toLowerCase();
    let body: Record<string, any>;

    if (selectedBank === "mandiri" || selectedBank === "echannel") {
      body = {
        payment_type: "echannel",
        transaction_details: {
          order_id: uniqueAttemptOrderId,
          gross_amount: order.total,
        },
        customer_details: {
          email: order.customerEmail || undefined,
          phone: order.customerPhone || undefined,
        },
        echannel: {
          bill_info1: "Pembayaran Order",
          bill_info2: order.orderNumber,
        },
      };
    } else if (selectedBank === "permata") {
      body = {
        payment_type: "bank_transfer",
        transaction_details: {
          order_id: uniqueAttemptOrderId,
          gross_amount: order.total,
        },
        customer_details: {
          email: order.customerEmail || undefined,
          phone: order.customerPhone || undefined,
        },
        bank_transfer: {
          bank: "permata",
        },
      };
    } else {
      // BCA, BNI, BRI
      const standardBank = ["bni", "bri"].includes(selectedBank) ? selectedBank : "bca";
      body = {
        payment_type: "bank_transfer",
        transaction_details: {
          order_id: uniqueAttemptOrderId,
          gross_amount: order.total,
        },
        customer_details: {
          email: order.customerEmail || undefined,
          phone: order.customerPhone || undefined,
        },
        bank_transfer: {
          bank: standardBank,
        },
      };
    }

    await logPayment(order.id, "request", `midtrans_va_${selectedBank}`, body);
    const res = await fetch(`${CORE_API_BASE_URL}/charge`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: serverKeyAuthHeader(),
      },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    await logPayment(order.id, "response", `midtrans_va_${selectedBank}`, data, res.status);

    if (res.ok && (data.status_code === "201" || data.status_code === "200")) {
      const vaNumber =
        data.va_numbers?.[0]?.va_number ||
        data.permata_va_number ||
        data.bill_key ||
        undefined;
      const bankName =
        data.va_numbers?.[0]?.bank?.toUpperCase() ||
        (selectedBank === "echannel" ? "MANDIRI" : selectedBank.toUpperCase());

      return {
        orderId: order.id,
        orderNumber: order.orderNumber,
        paymentType: "bank_transfer",
        vaNumber: vaNumber,
        bankName: bankName,
        billerCode: data.biller_code,
        billKey: data.bill_key,
        expiryTime: data.expiry_time,
        rawResponse: data,
      };
    }
  }

  // 4. QRIS Direct Core API
  if (code === "qris") {
    const body: Record<string, any> = {
      payment_type: "qris",
      transaction_details: {
        order_id: uniqueAttemptOrderId,
        gross_amount: order.total,
      },
      customer_details: {
        email: order.customerEmail || undefined,
        phone: order.customerPhone || undefined,
      },
      qris: {
        acquirer: "gopay",
      },
    };

    await logPayment(order.id, "request", "midtrans_qris", body);
    const res = await fetch(`${CORE_API_BASE_URL}/charge`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: serverKeyAuthHeader(),
      },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    await logPayment(order.id, "response", "midtrans_qris", data, res.status);

    if (res.ok && (data.status_code === "201" || data.status_code === "200")) {
      const actions: Array<{ name: string; url: string }> = data.actions || [];
      const qrAction = actions.find((a) => a.name === "generate-qr-code");

      return {
        orderId: order.id,
        orderNumber: order.orderNumber,
        paymentType: "qris",
        qrUrl: qrAction?.url,
        qrString: data.qr_string,
        expiryTime: data.expiry_time,
        rawResponse: data,
      };
    }
  }

  // 5. Default Fallback ke Midtrans Snap Transaction
  const snap = await createSnapTransaction(order);
  return {
    orderId: order.id,
    orderNumber: order.orderNumber,
    paymentType: code || "snap",
    snapToken: snap.token,
    redirectUrl: snap.redirect_url,
  };
}

async function logPayment(
  orderId: string | number,
  direction: "request" | "response",
  provider: string,
  payload: any,
  httpStatus?: number
) {
  try {
    await sql`
      insert into payment_logs (order_id, direction, provider, payload, http_status)
      values (${orderId}, ${direction}, ${provider}, ${JSON.stringify(payload)}, ${httpStatus || null})
    `;
  } catch (err) {
    console.warn("[midtrans] logPayment error:", err);
  }
}

/**
 * Buat transaksi Snap (dapat snap_token + redirect_url).
 * Selalu mengarah ke Midtrans SANDBOX kecuali MIDTRANS_IS_PRODUCTION=true di .env.
 * Semua request & response dicatat ke payment_logs (poin 19).
 */
export async function createSnapTransaction(order: ChargeOrderInput) {
  const uniqueAttemptOrderId = `${order.orderNumber}-${Date.now()}`;
  const enabledPayments = getEnabledPayments(order.paymentMethodCode);

  const body: Record<string, any> = {
    transaction_details: {
      order_id: uniqueAttemptOrderId,
      gross_amount: order.total,
    },
    customer_details: {
      email: order.customerEmail || undefined,
      phone: order.customerPhone || undefined,
    },
    item_details: [
      {
        id: String(order.id),
        price: order.total,
        quantity: 1,
        name: `Order ${order.orderNumber}`,
      },
    ],
    callbacks: {
      finish: `ercoffeelab://orders/${order.id}`,
    },
  };

  if (enabledPayments && enabledPayments.length > 0) {
    body.enabled_payments = enabledPayments;
  }

  await logPayment(order.id, "request", "midtrans_snap", body);

  const res = await fetch(`${SNAP_BASE_URL}/transactions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: serverKeyAuthHeader(),
    },
    body: JSON.stringify(body),
  });
  const data = await res.json();

  await logPayment(order.id, "response", "midtrans_snap", data, res.status);

  if (!res.ok) {
    throw new Error(
      data.error_messages?.join(", ") || "Gagal membuat transaksi Midtrans"
    );
  }

  return data as { token: string; redirect_url: string };
}

/**
 * Verifikasi signature webhook Midtrans.
 * Formula resmi: SHA512(order_id + status_code + gross_amount + ServerKey)
 */
export function verifyMidtransSignature(payload: {
  order_id: string;
  status_code: string;
  gross_amount: string;
  signature_key: string;
}) {
  const serverKey = process.env.MIDTRANS_SERVER_KEY;
  if (!serverKey) throw new Error("MIDTRANS_SERVER_KEY belum diisi di .env");
  const expected = crypto
    .createHash("sha512")
    .update(
      payload.order_id + payload.status_code + payload.gross_amount + serverKey,
    )
    .digest("hex");
  return expected === payload.signature_key;
}

/**
 * Cek status transaksi langsung ke API Midtrans (GET /v2/{order_id}/status).
 */
export async function checkMidtransTransactionStatus(orderIdOrAttemptId: string) {
  const url = `${CORE_API_BASE_URL}/${encodeURIComponent(orderIdOrAttemptId)}/status`;

  const res = await fetch(url, {
    method: "GET",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      Authorization: serverKeyAuthHeader(),
    },
  });

  const data = await res.json();
  return {
    httpStatus: res.status,
    ok: res.ok,
    data: data as {
      status_code?: string;
      status_message?: string;
      transaction_id?: string;
      order_id?: string;
      gross_amount?: string;
      payment_type?: string;
      transaction_time?: string;
      transaction_status?: string;
      fraud_status?: string;
      signature_key?: string;
      [key: string]: any;
    },
  };
}



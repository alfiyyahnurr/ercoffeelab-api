import "dotenv/config";
import { drizzle } from "drizzle-orm/neon-http";
import { neon } from "@neondatabase/serverless";
import bcrypt from "bcryptjs";
import * as schema from "./schema";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL belum diisi di file .env");
}

// Seed pakai Drizzle query builder (lebih enak buat insert batch + return id),
// walaupun runtime API tetap pakai raw SQL (lihat client.ts).
const client = neon(process.env.DATABASE_URL);
const db = drizzle(client, { schema });

async function main() {
  console.log("Seeding ercoffeelab...");

  // Guard idempotency: schema.outlets tidak punya kolom unique (cuma name/address biasa),
  // jadi kalau seed dijalankan 2x tanpa guard ini bakal numpuk data duplikat, dan insert
  // staffUsers akan gagal di percobaan kedua karena email sudah unique.
  const existingOutlets = await db.select().from(schema.outlets).limit(1);
  if (existingOutlets.length > 0) {
    console.log(
      "Seed dibatalkan: tabel outlets sudah ada isinya (kemungkinan sudah pernah di-seed sebelumnya).",
    );
    console.log(
      "Kalau mau re-seed dari nol, TRUNCATE dulu tabel terkait di Neon SQL Editor:",
    );
    console.log(`
  TRUNCATE TABLE
    product_outlets, products, categories, outlets,
    payment_methods, staff_users, loyalty_tiers, notification_templates
  RESTART IDENTITY CASCADE;
    `);
    return;
  }

  // --- Outlets ---
  const [bandung, jakarta] = await db
    .insert(schema.outlets)
    .values([
      {
        name: "ERCoffeeLab Bandung",
        address: "Jl. Braga No. 10, Bandung",
        openHour: "07:00",
        closeHour: "21:00",
        isOpen: true,
        latitude: -6.9175,
        longitude: 107.6191,
      },
      {
        name: "ERCoffeeLab Jakarta",
        address: "Jl. Sudirman No. 25, Jakarta",
        openHour: "07:00",
        closeHour: "22:00",
        isOpen: true,
        latitude: -6.2088,
        longitude: 106.8456,
      },
    ])
    .returning();

  // --- Categories ---
  const [coffeeCat, foodCat] = await db
    .insert(schema.categories)
    .values([
      { name: "Coffee", groupName: "beverage" },
      { name: "Snack", groupName: "food" },
    ])
    .returning();

  // --- Products ---
  const [americano, latte, croissant] = await db
    .insert(schema.products)
    .values([
      {
        categoryId: coffeeCat.id,
        name: "Americano",
        type: "beverage",
        basePrice: 20000,
        isBestseller: true,
      },
      {
        categoryId: coffeeCat.id,
        name: "Latte",
        type: "beverage",
        basePrice: 25000,
      },
      {
        categoryId: foodCat.id,
        name: "Croissant",
        type: "food",
        basePrice: 18000,
      },
    ])
    .returning();

  // --- Product x Outlet (poin 1: Americano cuma ada di Bandung) ---
  await db.insert(schema.productOutlets).values([
    { productId: americano.id, outletId: bandung.id, isAvailable: true },
    { productId: americano.id, outletId: jakarta.id, isAvailable: false },
    { productId: latte.id, outletId: bandung.id, isAvailable: true },
    { productId: latte.id, outletId: jakarta.id, isAvailable: true },
    { productId: croissant.id, outletId: bandung.id, isAvailable: true },
    { productId: croissant.id, outletId: jakarta.id, isAvailable: true },
  ]);

  // --- Payment methods ---
  await db.insert(schema.paymentMethods).values([
    { code: "qris", displayName: "QRIS", isActive: true },
    { code: "gopay", displayName: "GoPay", isActive: true },
    { code: "bank_transfer", displayName: "Transfer Bank", isActive: true },
    { code: "cash", displayName: "Tunai (Pickup)", isActive: true },
  ]);

  // --- Staff: super_admin ---
  // Password demo: "demo1234" — HANYA untuk development/testing, ganti/hapus sebelum production.
  const demoPasswordHash = await bcrypt.hash("demo1234", 10);

  await db.insert(schema.staffUsers).values([
    {
      email: "alfiyyah@gmail.com",
      fullName: "Alfiyyah Admin",
      role: "super_admin",
      passwordHash: demoPasswordHash,
      isActive: true,
    },
    {
      email: "bandung.admin@ercoffeelab.com",
      fullName: "Admin Outlet Bandung",
      role: "outlet_admin",
      outletId: bandung.id,
      passwordHash: demoPasswordHash,
      isActive: true,
    },
  ]);

  // --- Loyalty tiers (poin 8) ---
  await db.insert(schema.loyaltyTiers).values([
    { name: "Bronze", minPoints: 0, minOrders: 0, sortOrder: 1 },
    { name: "Silver", minPoints: 500, minOrders: 10, sortOrder: 2 },
    { name: "Gold", minPoints: 1500, minOrders: 30, sortOrder: 3 },
    { name: "Platinum", minPoints: 5000, minOrders: 100, sortOrder: 4 },
  ]);

  // --- Notification templates (poin 13) ---
  await db.insert(schema.notificationTemplates).values([
    {
      code: "order_paid",
      channel: "whatsapp",
      bodyTemplate:
        "Halo {{customer_name}}, pembayaran pesanan {{order_number}} sudah kami terima. Pesananmu sedang disiapkan!",
      isActive: true,
    },
    {
      code: "customer_birthday",
      channel: "whatsapp",
      bodyTemplate:
        "Selamat ulang tahun {{customer_name}}! Nikmati diskon spesial hari ini di ERCoffeeLab.",
      isActive: true,
    },
    {
      code: "otp_code",
      channel: "whatsapp",
      bodyTemplate:
        "Kode OTP ERCoffeeLab Anda adalah: {{otpCode}} (untuk {{purpose}}). Jangan berikan kode ini kepada siapapun. Berlaku 5 menit.",
      isActive: true,
    },
  ]);


  // --- Vouchers ---
  await db.insert(schema.vouchers).values([
    {
      name: "Diskon Pelanggan Baru 20%",
      description: "Diskon 20% khusus pengguna baru dengan minimal pembelian Rp30.000",
      code: "WELCOME20",
      discountType: "percent",
      discountValue: 20,
      minPurchase: 30000,
      maxDiscount: 15000,
      isActive: true,
    },
    {
      name: "Voucher Potongan Rp10.000",
      description: "Potongan harga Rp10.000 untuk transaksi kopi favoritmu",
      code: "HEMAT10K",
      discountType: "fixed",
      discountValue: 10000,
      minPurchase: 40000,
      isActive: true,
    },
  ]);


  console.log("Seed selesai:", {
    outlets: [bandung.name, jakarta.name],
    products: [americano.name, latte.name, croissant.name],
  });
  console.log(
    "Demo login admin panel: admin@ercoffeelab.com / demo1234 (super_admin)",
  );
  console.log(
    "Demo login admin panel: bandung.admin@ercoffeelab.com / demo1234 (outlet_admin)",
  );
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });

import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { requireStaff } from "@/lib/auth-middleware";

// Max file size: 5MB
const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024;
const ALLOWED_MIME_TYPES = [
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/gif",
];

/**
 * POST /api/upload
 * Require staff (super_admin / outlet_admin).
 * Body: formData containing 'file' field.
 * Returns: { url: "/uploads/products/timestamp_filename.jpg" }
 */
export async function POST(req: Request) {
  const auth = await requireStaff(req);
  if ("error" in auth) return auth.error;

  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json(
        { error: "File gambar wajib diunggah (field 'file')" },
        { status: 400 }
      );
    }

    // 1. Validasi Tipe File Image
    if (!ALLOWED_MIME_TYPES.includes(file.type)) {
      return NextResponse.json(
        { error: `Tipe file tidak didukung (${file.type}). Hanya diperbolehkan JPG, PNG, WEBP, GIF.` },
        { status: 400 }
      );
    }

    // 2. Validasi Ukuran File (Max 5MB)
    if (file.size > MAX_FILE_SIZE_BYTES) {
      return NextResponse.json(
        { error: `Ukuran file melebihi batas maksimum 5MB (Ukuran file Anda: ${(file.size / (1024 * 1024)).toFixed(2)}MB)` },
        { status: 400 }
      );
    }

    // 3. Simpan File (Local disk untuk dev, Base64 Data URL / Cloud fallback untuk Vercel Serverless)
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    // Cek apakah berjalan di Vercel atau lingkungan Serverless Read-Only
    const isVercel = process.env.VERCEL === "1" || process.env.NODE_ENV === "production";

    if (isVercel) {
      // Di Vercel serverless, filesystem adalah Read-Only.
      // Kita ubah gambar menjadi Base64 Data URL agar bisa disimpan & ditampilkan langsung di DB/UI
      const base64Image = buffer.toString("base64");
      const dataUrl = `data:${file.type};base64,${base64Image}`;

      return NextResponse.json(
        {
          message: "Upload gambar berhasil (Base64 Data URL)",
          url: dataUrl,
          filename: file.name,
          size: file.size,
          mimeType: file.type,
        },
        { status: 201 }
      );
    }

    // Jika di lokal development (Localhost), simpan ke /public/uploads/products/
    try {
      const uploadsDir = path.join(process.cwd(), "public", "uploads", "products");
      if (!fs.existsSync(uploadsDir)) {
        fs.mkdirSync(uploadsDir, { recursive: true });
      }

      const sanitizedFileName = file.name.replace(/[^a-zA-Z0-9.-]/g, "_");
      const uniqueFileName = `${Date.now()}_${sanitizedFileName}`;
      const filePath = path.join(uploadsDir, uniqueFileName);

      fs.writeFileSync(filePath, buffer);

      const publicUrl = `/uploads/products/${uniqueFileName}`;

      return NextResponse.json(
        {
          message: "Upload gambar berhasil",
          url: publicUrl,
          filename: uniqueFileName,
          size: file.size,
          mimeType: file.type,
        },
        { status: 201 }
      );
    } catch (fsErr: any) {
      // Fallback jika permission disk lokal ditolak / EROFS
      const base64Image = buffer.toString("base64");
      const dataUrl = `data:${file.type};base64,${base64Image}`;

      return NextResponse.json(
        {
          message: "Upload gambar berhasil (Fallback Data URL)",
          url: dataUrl,
          filename: file.name,
          size: file.size,
          mimeType: file.type,
        },
        { status: 201 }
      );
    }
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Gagal mengunggah file gambar" },
      { status: 500 }
    );
  }
}

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
 * Returns: { url: "/uploads/products/timestamp_filename.jpg" } or Base64 Data URL on read-only serverless environments.
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

    // 3. Simpan File ke disk (Local Dev) ATAU Base64 Data URL (Fallback untuk Vercel / Read-Only Serverless)
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    const sanitizedFileName = file.name.replace(/[^a-zA-Z0-9.-]/g, "_");
    const uniqueFileName = `${Date.now()}_${sanitizedFileName}`;

    let publicUrl = "";

    try {
      const uploadsDir = path.join(process.cwd(), "public", "uploads", "products");
      if (!fs.existsSync(uploadsDir)) {
        fs.mkdirSync(uploadsDir, { recursive: true });
      }

      const filePath = path.join(uploadsDir, uniqueFileName);
      fs.writeFileSync(filePath, buffer);
      publicUrl = `/uploads/products/${uniqueFileName}`;
    } catch (writeErr: any) {
      // Fallback untuk Lingkungan Read-Only Serverless (Vercel / AWS Lambda / /var/task)
      if (
        writeErr?.code === "EROFS" ||
        writeErr?.code === "EACCES" ||
        writeErr?.message?.includes("read-only") ||
        writeErr?.message?.includes("EROFS")
      ) {
        const base64 = buffer.toString("base64");
        publicUrl = `data:${file.type};base64,${base64}`;
      } else {
        throw writeErr;
      }
    }

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
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Gagal mengunggah file gambar" },
      { status: 500 }
    );
  }
}

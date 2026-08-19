import { NextResponse } from "next/server";
import { sql } from "@/src/db/client";

export async function GET() {
  try {
    const rows = await sql`select count(*)::int as total from outlets`;
    return NextResponse.json({ status: "ok", outlets: rows[0].total });
  } catch (err) {
    return NextResponse.json({ status: "error", message: String(err) }, { status: 500 });
  }
}

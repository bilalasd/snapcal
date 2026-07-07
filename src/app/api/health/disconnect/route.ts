import { NextResponse } from "next/server";
import { db, healthTokens } from "@/db";

export async function POST() {
  await db.delete(healthTokens);
  return NextResponse.json({ ok: true });
}

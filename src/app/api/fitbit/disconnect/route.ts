import { NextResponse } from "next/server";
import { db, fitbitTokens } from "@/db";

export async function POST() {
  await db.delete(fitbitTokens);
  return NextResponse.json({ ok: true });
}

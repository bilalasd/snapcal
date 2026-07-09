import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { auth } from "@clerk/nextjs/server";
import { db, healthTokens } from "@/db";

export async function POST() {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  await db.delete(healthTokens).where(eq(healthTokens.userId, userId));
  return NextResponse.json({ ok: true });
}

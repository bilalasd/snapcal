import { NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { auth } from "@clerk/nextjs/server";
import { db, weights } from "@/db";

export async function GET() {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const [latest] = await db
    .select()
    .from(weights)
    .where(eq(weights.userId, userId))
    .orderBy(desc(weights.date))
    .limit(1);
  return NextResponse.json(
    latest ? { date: latest.date, weight_kg: Number(latest.weightKg) } : null,
  );
}

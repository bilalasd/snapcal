import { NextResponse } from "next/server";
import { desc } from "drizzle-orm";
import { db, weights } from "@/db";

export async function GET() {
  const [latest] = await db
    .select()
    .from(weights)
    .orderBy(desc(weights.date))
    .limit(1);
  return NextResponse.json(
    latest ? { date: latest.date, weight_kg: Number(latest.weightKg) } : null,
  );
}

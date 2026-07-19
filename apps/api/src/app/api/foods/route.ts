import { NextRequest, NextResponse } from "next/server";
import { ilike, sql } from "drizzle-orm";
import { auth } from "@clerk/nextjs/server";
import { db, foods } from "@/db";

/** Search the USDA food reference by name. */
export async function GET(request: NextRequest) {
  // Defense in depth: the proxy middleware already gates this, but every other
  // route re-checks in-handler so auth never rides on the matcher alone.
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const q = request.nextUrl.searchParams.get("q")?.trim();
  if (!q || q.length < 2) return NextResponse.json([]);

  const rows = await db
    .select()
    .from(foods)
    .where(ilike(foods.description, `%${q}%`))
    // Shorter descriptions tend to be the plainer, more useful staples
    .orderBy(sql`length(${foods.description})`)
    .limit(25);

  return NextResponse.json(
    rows.map((f) => ({
      id: f.id,
      description: f.description,
      calories: Number(f.calories),
      proteinG: Number(f.proteinG),
      carbsG: Number(f.carbsG),
      fatG: Number(f.fatG),
      satFatG: f.satFatG === null ? null : Number(f.satFatG),
      fiberG: f.fiberG === null ? null : Number(f.fiberG),
      sugarG: f.sugarG === null ? null : Number(f.sugarG),
      sodiumMg: f.sodiumMg === null ? null : Number(f.sodiumMg),
    })),
  );
}

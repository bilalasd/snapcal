import { NextRequest, NextResponse } from "next/server";
import { createMeal, listFavorites, listMeals, mealInput } from "@/lib/meals";

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;

  if (params.get("favorites") === "true") {
    return NextResponse.json(await listFavorites());
  }

  // ?date=YYYY-MM-DD (single local day, with tz offset minutes) or ?from=&to= ISO
  const date = params.get("date");
  const tzOffset = Number(params.get("tz_offset") ?? "0"); // minutes, from client
  let from: Date;
  let to: Date;

  if (date) {
    const dayStartUtc = new Date(`${date}T00:00:00Z`);
    from = new Date(dayStartUtc.getTime() + tzOffset * 60_000);
    to = new Date(from.getTime() + 24 * 60 * 60 * 1000 - 1);
  } else {
    const fromParam = params.get("from");
    const toParam = params.get("to");
    if (!fromParam || !toParam) {
      return NextResponse.json(
        { error: "Provide ?date= or ?from=&to=" },
        { status: 400 },
      );
    }
    from = new Date(fromParam);
    to = new Date(toParam);
  }

  if (isNaN(from.getTime()) || isNaN(to.getTime())) {
    return NextResponse.json({ error: "Invalid date range" }, { status: 400 });
  }

  return NextResponse.json(await listMeals(from, to));
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const parsed = mealInput.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid meal", details: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const meal = await createMeal(parsed.data);
  return NextResponse.json(meal, { status: 201 });
}

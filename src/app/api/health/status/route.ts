import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getHealthStatus } from "@/lib/google-health";

export async function GET() {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.json(await getHealthStatus(userId));
}

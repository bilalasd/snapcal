import { NextResponse } from "next/server";
import { getHealthStatus } from "@/lib/google-health";

export async function GET() {
  return NextResponse.json(await getHealthStatus());
}

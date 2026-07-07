import { NextResponse } from "next/server";
import { getFitbitStatus } from "@/lib/fitbit";

export async function GET() {
  return NextResponse.json(await getFitbitStatus());
}

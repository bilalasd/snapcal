import { NextRequest, NextResponse } from "next/server";
import { put } from "@vercel/blob";

export const maxDuration = 30;

const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_BYTES = 3 * 1024 * 1024;

/** Upload a single meal photo to Blob, returns { url, pathname }. */
export async function POST(request: NextRequest) {
  const contentType = request.headers.get("content-type") ?? "";
  if (!ALLOWED.has(contentType)) {
    return NextResponse.json(
      { error: "Unsupported image type" },
      { status: 400 },
    );
  }
  const bytes = await request.arrayBuffer();
  if (bytes.byteLength === 0 || bytes.byteLength > MAX_BYTES) {
    return NextResponse.json({ error: "Invalid image size" }, { status: 400 });
  }

  const ext = contentType.split("/")[1];
  const blob = await put(`meals/${crypto.randomUUID()}.${ext}`, bytes, {
    access: "public",
    contentType,
  });

  return NextResponse.json({ url: blob.url, pathname: blob.pathname });
}

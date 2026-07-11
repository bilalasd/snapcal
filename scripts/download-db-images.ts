/**
 * Download every meal photo referenced in the DB (Vercel Blob URLs) into
 * bench/images/, so `npm run bench` can test the models on real meals.
 *
 *   npm run download-images
 *
 * Needs DATABASE_URL in .env.local. Skips files already downloaded.
 */
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { db, mealPhotos } from "../src/db";

const OUT = join(process.cwd(), "bench/images");

function extFor(name: string, contentType: string): string {
  if (/\.(jpe?g|png|webp|gif)$/i.test(name)) return "";
  if (contentType.includes("png")) return ".png";
  if (contentType.includes("webp")) return ".webp";
  if (contentType.includes("gif")) return ".gif";
  return ".jpg";
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  const rows = await db
    .select({ url: mealPhotos.url, pathname: mealPhotos.pathname })
    .from(mealPhotos);

  const seen = new Set<string>();
  let saved = 0;
  for (const { url, pathname } of rows) {
    if (seen.has(url)) continue;
    seen.add(url);

    const res = await fetch(url);
    if (!res.ok) {
      console.warn(`skip ${url} — HTTP ${res.status}`);
      continue;
    }
    const base = basename(pathname) || `img-${seen.size}`;
    const name = base + extFor(base, res.headers.get("content-type") ?? "");
    const dest = join(OUT, name);
    if (existsSync(dest)) continue;

    const buf = Buffer.from(await res.arrayBuffer());
    writeFileSync(dest, buf);
    saved++;
    console.log(`saved ${name} (${(buf.length / 1024).toFixed(0)} KB)`);
  }

  console.log(
    `\n${saved} new image(s) in bench/images/ (${seen.size} photo rows in DB).`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

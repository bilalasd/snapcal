import { readdirSync, readFileSync } from "node:fs";
const files = readdirSync("bench").filter(f => f.startsWith("results-")).sort();
const latest = "bench/" + files[files.length - 1];
const { runs } = JSON.parse(readFileSync(latest, "utf8"));
const exp = JSON.parse(readFileSync("bench/expected.json", "utf8"));
const ok = runs.filter(r => !r.error);
const m = a => a.length ? a.reduce((x,y)=>x+y,0)/a.length : NaN;
console.log("image".padEnd(26), "exp", "raw", "usda", " rawE%", "usdaE%");
for (const r of ok) {
  console.log(r.image.padEnd(26), String(exp[r.image]).padStart(4), String(r.raw.cal).padStart(4), String(r.usda.cal).padStart(4),
    r.raw.errPct.toFixed(0).padStart(5), r.usda.errPct.toFixed(0).padStart(5));
}
console.log("\nMEAN raw err%:", m(ok.map(r=>r.raw.errPct)).toFixed(1), " | usda err%:", m(ok.map(r=>r.usda.errPct)).toFixed(1),
  "| failures:", runs.length-ok.length);

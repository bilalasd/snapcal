import { readdirSync, readFileSync } from "node:fs";
const files = readdirSync("bench").filter(f => f.startsWith("results-")).sort();
const { runs } = JSON.parse(readFileSync("bench/" + files[files.length - 1], "utf8"));
const ok = runs.filter(r => !r.error);
const m = a => a.length ? a.reduce((x,y)=>x+y,0)/a.length : NaN;
const med = a => { const s=[...a].sort((x,y)=>x-y); return s[Math.floor(s.length/2)]; };
console.log("MEAN raw err%:", m(ok.map(r=>r.raw.errPct)).toFixed(1),
  "| usda err%:", m(ok.map(r=>r.usda.errPct)).toFixed(1),
  "| vision ms median:", med(ok.map(r=>r.visionMs)), "mean:", Math.round(m(ok.map(r=>r.visionMs))),
  "| failures:", runs.length-ok.length);

/**
 * Offline eval for the receipt scan.
 *
 *   ANTHROPIC_API_KEY=sk-ant-... npx tsx scripts/scan-eval.ts [--only klook]
 *
 * Reads fixtures/receipts/expected.json, scans every fixture image that exists
 * on disk, and prints a pass/fail table per field. Also runs one "pair" case
 * (Didi + TnG for the same amount) when both files exist.
 */
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { scanImages, type Media } from "../lib/scan";
import type { ScanResult } from "../lib/types";

const DIR = path.join(process.cwd(), "fixtures", "receipts");
const only = process.argv.includes("--only") ? process.argv[process.argv.indexOf("--only") + 1] : null;

interface Expect {
  file: string;
  expect: Partial<ScanResult> & { description_like?: string; note?: string };
}

function load(file: string): { media: Media; data: string } {
  const ext = path.extname(file).toLowerCase();
  const media: Media = ext === ".png" ? "image/png" : ext === ".webp" ? "image/webp" : "image/jpeg";
  return { media, data: readFileSync(path.join(DIR, file)).toString("base64") };
}

function close(a: number | null | undefined, b: number | null | undefined, tol: number) {
  if (a == null || b == null) return a == b;
  return Math.abs(a - b) <= tol;
}

async function run() {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("Set ANTHROPIC_API_KEY first.");
    process.exit(1);
  }
  const cases = JSON.parse(readFileSync(path.join(DIR, "expected.json"), "utf8")) as Expect[];
  let pass = 0,
    fail = 0;
  for (const c of cases) {
    if (only && !c.file.includes(only)) continue;
    if (!existsSync(path.join(DIR, c.file))) {
      console.log(`⏭  ${c.file} (missing — drop the screenshot into fixtures/receipts/)`);
      continue;
    }
    const r = await scanImages([load(c.file)], { today: "2026-11-05", tripCode: "PDL10X" });
    if (!r.ok) {
      console.log(`❌ ${c.file}: ${r.error}`);
      fail++;
      continue;
    }
    const got = r.claims[0];
    const e = c.expect;
    const checks: [string, boolean, string][] = [
      ["amount_rmb", close(got.amount_rmb, e.amount_rmb, 0.01), `${got.amount_rmb} vs ${e.amount_rmb}`],
      ["amount_myr", close(got.amount_myr, e.amount_myr, 0.01), `${got.amount_myr} vs ${e.amount_myr}`],
      ["rate", e.rate === undefined || close(got.rate, e.rate, 0.0005), `${got.rate} vs ${e.rate}`],
      ["date", e.date === undefined || got.date === e.date, `${got.date} vs ${e.date}`],
      ["category", e.category === undefined || got.category === e.category, `${got.category} vs ${e.category}`],
      ["platform", e.platform === undefined || got.platform === e.platform, `${got.platform} vs ${e.platform}`],
      ["payment", e.payment_method === undefined || got.payment_method === e.payment_method, `${got.payment_method} vs ${e.payment_method}`],
      ["merchant", e.merchant === undefined || (got.merchant ?? "").includes(String(e.merchant).split(" ")[0]), `${got.merchant} vs ${e.merchant}`],
      ["purpose", e.purpose === undefined || got.purpose === e.purpose, `${got.purpose} vs ${e.purpose}`],
    ];
    const bad = checks.filter((x) => !x[1]);
    if (bad.length) fail++;
    else pass++;
    console.log(`${bad.length ? "❌" : "✅"} ${c.file} → "${got.description}" [${got.confidence}] claims=${r.claims.length}`);
    for (const [name, ok, detail] of checks) if (!ok) console.log(`     ✗ ${name}: ${detail}`);
    if (got.notes) console.log(`     note: ${got.notes}`);
    if (got.verification?.checked) {
      const v = got.verification;
      console.log(`     2nd read: ${v.corrections.length} correction(s)${v.issues.length ? `, auto-checks flagged ${v.issues.length}` : ""}`);
      for (const c of v.corrections) console.log(`       · ${c.field}: ${c.from} → ${c.to} (${c.why})`);
    }
    console.log(`     tokens in/out: ${r.usage.input_tokens}/${r.usage.output_tokens} (cache read ${r.usage.cache_read_input_tokens ?? 0})`);
  }

  // Pair case: Didi trip (¥16.20, no date) + a TnG screenshot for the same CNY → one claim with date/MYR/rate from TnG.
  const pair = ["didi-hotel-to-yumanlou.jpg", "tng-didi-16-20.jpg"];
  if (pair.every((f) => existsSync(path.join(DIR, f))) && (!only || only === "pair")) {
    const r = await scanImages(pair.map(load), { today: "2026-11-05" });
    if (r.ok) {
      const one = r.claims.length === 1 && close(r.claims[0].amount_rmb, 16.2, 0.01) && r.claims[0].amount_myr != null && r.claims[0].date != null;
      console.log(`${one ? "✅" : "❌"} pair didi+tng → ${r.claims.length} claim(s): ${JSON.stringify(r.claims.map((c) => [c.description, c.amount_rmb, c.amount_myr, c.date]))}`);
      one ? pass++ : fail++;
    } else console.log(`❌ pair: ${r.error}`);
  }

  // Multi case: two unrelated Didi trips → two claims.
  const multi = ["didi-hotel-to-yumanlou.jpg", "didi-hotel-to-airport.jpg"];
  if (multi.every((f) => existsSync(path.join(DIR, f))) && (!only || only === "multi")) {
    const r = await scanImages(multi.map(load), { today: "2026-11-05" });
    if (r.ok) {
      const two = r.claims.length === 2;
      console.log(`${two ? "✅" : "❌"} multi 2×didi → ${r.claims.length} claim(s): ${r.claims.map((c) => `${c.description} ¥${c.amount_rmb}`).join(" | ")}`);
      two ? pass++ : fail++;
    } else console.log(`❌ multi: ${r.error}`);
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});

/**
 * Offline test of the reflexive scan loop with a stubbed Anthropic client:
 * pass 1 "misreads" CNY 1,075.00 as 1.075 → checkClaims flags the rate mismatch →
 * the stub's pass 2 returns the corrected value → scanImages must surface the correction.
 */
import assert from "node:assert/strict";
import { buildHints, checkClaims, scanImages } from "../lib/scan";
import { diffScan } from "../lib/scan-diff";

const base = {
  image_indexes: [0],
  date: "2026-10-14",
  merchant: "创意彩印(**燕)",
  description: "Printing - 创意彩印",
  category: "supplies",
  platform: "printing",
  payment_method: "tng",
  purpose: "company",
  amount_myr: 674.08,
  rate: 1.59475879,
  rate_source: "screenshot",
  confidence: "high",
  notes: null,
  images: [{ index: 0, type: "tng payment result", amount: 1075, currency: "RMB" }],
};

const calls: { pass: number; messages: unknown[]; userText: string }[] = [];
const stub = {
  messages: {
    parse: async (req: { messages: { role: string; content: unknown }[] }) => {
      const pass = req.messages.length === 1 ? 1 : 2;
      const last = req.messages[req.messages.length - 1];
      const userText = typeof last.content === "string" ? last.content : JSON.stringify(last.content).slice(0, 200);
      calls.push({ pass, messages: req.messages, userText });
      if (pass === 1) {
        return {
          stop_reason: "end_turn",
          content: [{ type: "text", text: "{}" }],
          usage: { input_tokens: 5000, output_tokens: 300, cache_creation_input_tokens: 4000, cache_read_input_tokens: 0 },
          parsed_output: { claims: [{ ...base, amount_rmb: 1.075 }] },
        };
      }
      assert.match(userText, /misread/, "pass 2 should receive the auto-check issue");
      return {
        stop_reason: "end_turn",
        content: [{ type: "text", text: "{}" }],
        usage: { input_tokens: 5100, output_tokens: 350, cache_creation_input_tokens: 0, cache_read_input_tokens: 4000 },
        parsed_output: {
          claims: [{ ...base, amount_rmb: 1075 }],
          corrections: [{ claim: 0, field: "amount_rmb", from: "1.075", to: "1075.00", why: "thousands comma read as decimal point" }],
        },
      };
    },
  },
};

async function main() {
  // checkClaims catches the comma-as-decimal misread
  const issues = checkClaims([{ ...base, amount_rmb: 1.075 } as never], 1, "2026-11-05");
  assert.equal(issues.length, 2); // rate mismatch + merchant still masked (normalize() strips it inside scanImages)
  assert.match(issues[0], /misread/);

  // full loop
  const r = await scanImages([{ media: "image/jpeg", data: "AAAA" }], { today: "2026-11-05", tripCode: "PDL013", hints: "- 创意彩印 → supplies/printing, company" }, stub as never);
  assert.ok(r.ok);
  if (!r.ok) return;
  assert.equal(r.passes, 2);
  assert.equal(r.claims[0].amount_rmb, 1075);
  assert.equal(r.claims[0].merchant, "创意彩印", "mask stripped");
  assert.equal(r.claims[0].verification?.checked, true);
  assert.equal(r.claims[0].verification?.corrections.length, 1);
  assert.equal(r.usage.input_tokens, 10100);
  assert.equal(r.usage.cache_read_input_tokens, 4000);
  // the first turn is reused byte-for-byte in pass 2 (cache hit) and carries the hints
  assert.deepEqual(calls[1].messages[0], calls[0].messages[0]);
  assert.match(JSON.stringify(calls[0].messages[0]), /Team memory/);
  assert.match(JSON.stringify(calls[0].messages[0]), /cache_control/);

  // verify=false → single pass, no verification
  const r2 = await scanImages([{ media: "image/jpeg", data: "AAAA" }], { today: "2026-11-05", verify: false }, stub as never);
  assert.ok(r2.ok && r2.passes === 1 && r2.claims[0].verification?.checked === false);

  // hints builder dedupes by merchant and skips transfers
  const hints = buildHints([
    { merchant: "高文阁", description: "Dinner - 高文阁", category: "food", platform: "restaurant", purpose: "team", kind: "expense" },
    { merchant: "高文阁", description: "Lunch - 高文阁", category: "food", platform: "restaurant", purpose: "team", kind: "expense" },
    { merchant: null, description: "Transfer to TY", category: "transfer", platform: null, purpose: "company", kind: "transfer" },
    { merchant: null, description: "Didi - hotel to airport", category: "transport", platform: "didi", purpose: "client", kind: "expense" },
  ]);
  assert.equal(hints.split("\n").length, 2);
  assert.match(hints, /高文阁 → food\/restaurant, team/);

  // diffScan: only real changes count
  const d = diffScan({ ...base, amount_rmb: 1075, merchant: "创意彩印", verification: undefined } as never, {
    date: "2026-10-14",
    description: "PDL013 Printing",
    category: "supplies",
    platform: "printing",
    payment_method: "tng",
    purpose: "company",
    amount_rmb: 1075,
    amount_myr: 674.08,
    rate: 1.59475879,
    merchant: "创意彩印",
  });
  assert.deepEqual(d, [{ field: "description", ai: "Printing - 创意彩印", user: "PDL013 Printing" }]);

  console.log("scan loop ✓  (issues → audit pass → corrections surfaced; cache reuse; hints; diff)");
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});

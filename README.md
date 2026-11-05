# Bino Pocket

Trip petty-cash claims for the Bino EduTour team. Snap the payment screenshot, the AI fills in the claim, management approves, and the Excel + WhatsApp summary are one tap away.

Mobile-first PWA · Next.js 16 · Supabase (inside the existing **Binocrm** project, tables prefixed `fin_`) · Claude vision for receipt scanning · Netlify.

---

## 1. Deploy on Netlify (10 minutes)

1. Push this folder to a GitHub repo (e.g. `bino-pocket`).
2. Netlify → **Add new site → Import an existing project** → pick the repo. Build settings are read from `netlify.toml` (build `npm run build`, Next.js runtime plugin).
3. **Site configuration → Environment variables** → add:

   | Variable | Value | Notes |
   |---|---|---|
   | `NEXT_PUBLIC_SUPABASE_URL` | `https://riyllfjnsainhtwnlmrm.supabase.co` | Binocrm project |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `sb_publishable_…` | Supabase → Project settings → API keys → *Publishable key* (safe for browsers) |
   | `ANTHROPIC_API_KEY` | `sk-ant-…` | console.anthropic.com → API keys. Powers the receipt scan. |

4. Deploy. Open the site on your phone → Share → **Add to Home Screen** (iOS) or **Install app** (Android Chrome).

Supabase side is already done (schema, RLS policies, `fin-receipts` storage bucket, admin accounts). Migrations live in the Supabase dashboard under *Database → Migrations* (`bino_finance_*`).

## 2. Accounts

Invite-only. Sign in with email + password.

- **Jesson** (`xeonnight22@gmail.com`) is **admin**, **Eric** (`ericswee02@gmail.com`) is **lead** — both use the password they already have on the Bino CRM (same Supabase auth).
- Admin adds everyone else in **Admin → Members** (name, email, starting password, role). Existing CRM users can be added with the same email and their password is updated to what you type.
- Roles: `member` submits claims · `lead` also reviews/approves and sees reports for trips they belong to · `admin` everything, all trips, members, Drive.

Test accounts to delete before go-live (Admin → Members → deactivate, or Supabase → Authentication → Users): `test-admin@bino.local`, `test-member@bino.local`, `test-lead@bino.local`. The seeded `PDL10X` trip and its sample claims can be deleted in Admin → Trips.

## 3. Google Drive archive (optional, ~5 minutes, once)

Receipts are stored privately in Supabase Storage. With Drive connected, every **approved** receipt is also copied to the admin's Google Drive as `Bino Pocket / {TRIP CODE} / {Member} / {date} {description}.jpg`, and the Excel export links each row to Drive.

Everything is done inside the app — **Admin → Google Drive archive** walks you through it with copy buttons and direct links:

1. Create a Google Cloud project, enable the Drive API, create an OAuth client (Web application) with the redirect URI the page shows you.
2. Paste the Client ID + Client secret into the page.
3. Tap **Connect Google Drive** and sign in with the Google account whose Drive should hold the receipts.

No environment variables and no redeploy needed. The connection is stored in `fin_settings` (readable by management only). "Copy trip receipts now" on the same page backfills anything uploaded earlier.

## 4. How the scan works

`/api/scan` sends up to 6 screenshots to Claude (`claude-opus-5-5`, structured output). The prompt in `lib/scan-prompt.ts` knows the exact layouts the team uses (Touch 'n Go payment result + details pages, Didi trip page, Klook receipt, Meituan, Alipay, WeChat, Wise, 12306…), merges a Chinese-app screenshot with its Touch 'n Go/Wise twin into one claim, reads the printed exchange rate, and never invents amounts. Ground truth for those layouts is in `fixtures/receipts/expected.json`; to check accuracy after a prompt change, drop the real screenshots in that folder and run:

```bash
ANTHROPIC_API_KEY=sk-ant-… npx tsx scripts/scan-eval.ts
```

Models: the first read uses **Claude Haiku 5.5** (`SCAN_MODEL`, ~US$0.002 per scan) and the second "audit" read re-checks every number against the same images; when the automatic checks flag a problem or the first read isn't fully confident, the audit escalates to **Claude Opus 5.5** (`SCAN_AUDIT_MODEL`, ~US$0.04 for that scan). Typical trip of 300 claims ≈ US$1–3. Set `SCAN_MODEL=claude-opus-5-5` in Netlify if you ever want maximum accuracy on every scan.

## 5. Rules & gamification

- Claims should be logged the same day. Logging a past day asks for a reason and flags the claim "late" to reviewers (we don't hard-lock — no internet in China is common). Submissions made offline are queued on the phone and sent automatically when back online.
- "Day done" check-in builds a streak; the report's *Hall of fame* shows most punctual, longest streak, food champion, biggest single.
- Trip budget bar on Home and Report (blue → amber at 80% → red over budget).

## 6. Local development

```bash
cp .env.example .env.local   # fill in values
npm install
npm run dev
```

`npx tsc --noEmit && npx eslint .` before committing.

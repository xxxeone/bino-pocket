# Receipt fixtures for the AI scan

Drop real screenshots here (JPEG/PNG) with the file names used in `expected.json`,
then run the eval against the live scan route:

```bash
ANTHROPIC_API_KEY=sk-ant-... npx tsx scripts/scan-eval.ts
```

`expected.json` documents each layout the team actually sends (Touch 'n Go / Alipay+
payment result, Touch 'n Go Details, Klook receipt, Didi trip-ended page) and the
values the scan must extract. These five are the ground truth that shaped
`lib/scan-prompt.ts`.

Screenshots contain personal data — this folder is git-ignored except for the
two text files.

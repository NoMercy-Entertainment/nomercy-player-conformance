import { compareChrome } from './chrome';

// `npx tsx src/chrome-report.ts` — every control the web chrome draws, and
// whether the desktop chrome has one.
const result = compareChrome();

process.stdout.write(`${result.web.length - result.missing.length}/${result.web.length} web chrome controls have a native counterpart\n\n`);

process.stdout.write(`missing on desktop (${result.missing.length}):\n`);
for (const id of result.missing) process.stdout.write(`  ${id}\n`);

process.stdout.write(`\nnative controls the web does not draw (${result.extra.length}):\n`);
for (const name of result.extra) process.stdout.write(`  ${name}\n`);

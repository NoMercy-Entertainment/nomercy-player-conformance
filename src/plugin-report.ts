import { comparePlugins, PluginResult } from './plugins';

// `npx tsx src/plugin-report.ts` — every web plugin and how much of it exists.
const all: PluginResult[] = comparePlugins();
const results: PluginResult[] = all.filter(entry => entry.isPlugin);
const packages: PluginResult[] = all.filter(entry => !entry.isPlugin);

const ported = results.filter(result => result.classes.some(entry => entry.ported));
const absent = results.filter(result => !result.classes.some(entry => entry.ported));

const totals = results.reduce(
  (sum, result) => ({ total: sum.total + result.total, present: sum.present + result.present }),
  { total: 0, present: 0 },
);

// Options as well as methods.
//
// The comparison read `kind === 'method'` and dropped every option on the
// floor, so a choice the reference offers and the port does not was invisible
// to a report that said 119/119. `KeyHandlerOptions.scope` was exactly that:
// the web defaults it to 'document' and the port had no such switch, so every
// keyboard shortcut died the moment anything else took focus, and no report
// comparing method names could ever have found it.
const optionTotals = results.reduce(
  (sum, result) => ({
    total: sum.total + result.options.total,
    present: sum.present + result.options.present,
  }),
  { total: 0, present: 0 },
);

process.stdout.write(`${ported.length}/${results.length} plugins have a native class; ${totals.present}/${totals.total} exported methods; ${optionTotals.present}/${optionTotals.total} options\n\n`);

const optionGaps = results.filter(result => result.options.missing.length > 0);
if (optionGaps.length > 0) {
  process.stdout.write('options the reference offers and the port does not:\n');
  for (const result of optionGaps) {
    process.stdout.write(`  ${result.plugin}\n`);
    for (const name of result.options.missing) process.stdout.write(`    ${name}\n`);
  }
  process.stdout.write('\n');
}

for (const result of results) {
  const mark = result.classes.some(entry => entry.ported) ? `${result.present}/${result.total}` : 'NOT PORTED';
  process.stdout.write(`${result.plugin.padEnd(28)} ${mark}\n`);
}

process.stdout.write(`\nno native class at all (${absent.length}):\n`);
for (const result of absent) process.stdout.write(`  ${result.plugin}\n`);

const packageTotals = packages.reduce(
  (sum, result) => ({ total: sum.total + result.total, present: sum.present + result.present }),
  { total: 0, present: 0 },
);

process.stdout.write(`
adapters and kit, outside any plugin: ${packageTotals.present}/${packageTotals.total}
`);
for (const result of packages) process.stdout.write(`  ${result.plugin.padEnd(26)} ${result.present}/${result.total}
`);

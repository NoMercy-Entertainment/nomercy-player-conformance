import { comparePlugins, PluginResult } from './plugins';

// `npx tsx src/plugin-report.ts` — every web plugin and how much of it exists.
const results: PluginResult[] = comparePlugins();

const ported = results.filter(result => result.classes.some(entry => entry.ported));
const absent = results.filter(result => !result.classes.some(entry => entry.ported));

const totals = results.reduce(
  (sum, result) => ({ total: sum.total + result.total, present: sum.present + result.present }),
  { total: 0, present: 0 },
);

process.stdout.write(`${ported.length}/${results.length} plugins have a native class; ${totals.present}/${totals.total} exported methods\n\n`);

for (const result of results) {
  const mark = result.classes.some(entry => entry.ported) ? `${result.present}/${result.total}` : 'NOT PORTED';
  process.stdout.write(`${result.plugin.padEnd(28)} ${mark}\n`);
}

process.stdout.write(`\nno native class at all (${absent.length}):\n`);
for (const result of absent) process.stdout.write(`  ${result.plugin}\n`);

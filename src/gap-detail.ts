import { comparePlugins } from './plugins';

// `npx tsx src/gap-detail.ts <plugin>` — the exact members a plugin is missing.
const wanted = process.argv[2];
for (const result of comparePlugins().filter(entry => entry.isPlugin)) {
  if (wanted && result.plugin !== wanted) continue;
  process.stdout.write(`\n${result.plugin} ${result.present}/${result.total}\n`);
  for (const name of result.missing) process.stdout.write(`  ${name}\n`);
}

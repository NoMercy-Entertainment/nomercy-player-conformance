import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { compare, GroupResult, ParityResult, Verdict } from './compare';

const OUT_DIR: string = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'out');

const MARK: Record<Verdict, string> = {
  'ok': 'ok',
  'reader-only': 'READER ONLY',
  'writer-only': 'WRITER ONLY',
  'renamed': 'RENAMED',
  'waived': 'waived',
  'missing': 'MISSING',
};

function groupBlock(group: GroupResult): string {
  const gaps = group.methods.filter(method => method.verdict !== 'ok');
  const head = `### ${group.player} · ${group.group} — ${group.ok}/${group.total}`;

  if (gaps.length === 0) return `${head}\n\ncomplete\n`;

  const rows = gaps
    .sort((a, b) => a.name.localeCompare(b.name))
    .map(method => `| \`${method.name}\` | ${method.kind} | ${MARK[method.verdict]} | ${method.native || '—'} |`)
    .join('\n');

  return `${head}\n\n| method | kind | verdict | native |\n| --- | --- | --- | --- |\n${rows}\n`;
}

export function renderMarkdown(result: ParityResult): string {
  const gradeable = result.totals.total - result.totals.waived;
  const percent = ((result.totals.ok / gradeable) * 100).toFixed(1);

  const summary = result.groups
    .map(group => `| ${group.player} | ${group.group} | ${group.ok}/${group.total - group.waived} | ${group.waived || ''} |`)
    .join('\n');

  const waived = result.groups
    .flatMap(group => group.methods)
    .filter(method => method.verdict === 'waived')
    .map(method => `- \`${method.name}\` (${method.player}) — ${method.native}`);

  return [
    `# Desktop parity — web contract ${result.contractVersion} vs the JVM ABI`,
    '',
    `${result.totals.ok} of ${gradeable} contract methods are callable natively the way the contract describes them (${percent}%). ${result.totals.gaps} gaps, ${result.totals.waived} waived.`,
    '',
    'The native side is each library\'s checked-in JVM binary-compatibility dump, which is the surface a desktop consumer can actually call.',
    '',
    '## By group',
    '',
    '| player | group | done | waived |',
    '| --- | --- | --- | --- |',
    summary,
    '',
    '## Gaps',
    '',
    result.groups.filter(group => group.ok < group.total - group.waived).map(groupBlock).join('\n'),
    '',
    '## Waived — declared by the web because it is the web',
    '',
    waived.length === 0 ? 'none' : waived.join('\n'),
    '',
    '## Native members the contract does not name',
    '',
    result.extra.length === 0
      ? 'none'
      : result.extra.map(entry => `- ${entry.player}: \`${entry.member}\``).join('\n'),
    '',
  ].join('\n');
}

const result = compare();
mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(`${OUT_DIR}/parity.json`, `${JSON.stringify(result, null, 2)}\n`);
writeFileSync(`${OUT_DIR}/parity.md`, renderMarkdown(result));
process.stdout.write(`${result.totals.ok}/${result.totals.total} methods at parity — wrote ${OUT_DIR}/parity.md\n`);

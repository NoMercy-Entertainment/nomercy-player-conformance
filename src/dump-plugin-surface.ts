import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

import { extractPluginSurface, SurfaceEntry } from './extract-plugin-surface';
import { REPO_ROOT } from './paths';

const OUT: string = resolve(REPO_ROOT, 'testing', 'nomercy-player-conformance', 'contract', 'plugin-surface.json');

function byKey(a: SurfaceEntry, b: SurfaceEntry): number {
  const ka: string = `${a.plugin}/${a.file}/${a.kind}/${a.name}`;
  const kb: string = `${b.plugin}/${b.file}/${b.kind}/${b.name}`;

  return ka < kb ? -1 : ka > kb ? 1 : 0;
}

const entries: SurfaceEntry[] = extractPluginSurface().sort(byKey);

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, `${JSON.stringify(entries, null, 2)}\n`, 'utf8');

process.stdout.write(`${entries.length} declarations across ${new Set(entries.map(e => e.plugin)).size} plugins\n`);

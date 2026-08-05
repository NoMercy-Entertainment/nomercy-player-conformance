import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { compare, ParityResult } from './compare';

const BASELINE: string = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'baseline.json');

/** Group key -> methods graded ok, the number that may only ever go up. */
type Baseline = Record<string, number>;

export function toBaseline(result: ParityResult): Baseline {
  return Object.fromEntries(result.groups.map(group => [`${group.player}:${group.group}`, group.ok]));
}

/**
 * A ratchet per group, not one total.
 *
 * A single number lets a subsystem rot while another gains, and the whole point
 * of grading group by group is that "transport is done" and "cast is empty" are
 * different facts. Losing a method anywhere fails, whatever the total says.
 */
export function regressions(current: Baseline, baseline: Baseline): string[] {
  return Object.entries(baseline)
    .filter(([key, was]) => (current[key] ?? 0) < was)
    .map(([key, was]) => `${key}: ${current[key] ?? 0} < ${was}`);
}

if (process.argv[1]?.endsWith('check.ts')) {
  const current = toBaseline(compare());

  if (process.argv.includes('--write') || !existsSync(BASELINE)) {
    writeFileSync(BASELINE, `${JSON.stringify(current, null, 2)}\n`);
    process.stdout.write(`wrote ${BASELINE}\n`);
  }
  else {
    const lost = regressions(current, JSON.parse(readFileSync(BASELINE, 'utf8')) as Baseline);

    if (lost.length > 0) {
      process.stderr.write(`Desktop parity regressed:\n${lost.map(line => `  ${line}`).join('\n')}\n`);
      process.exit(1);
    }

    process.stdout.write('Desktop parity held or improved.\n');
  }
}

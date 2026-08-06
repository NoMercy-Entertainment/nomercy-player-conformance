import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { compare, ParityResult } from './compare';
import { nativeEmissions } from './emission';
import { comparePlugins } from './plugins';

const BASELINE: string = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'baseline.json');

/** Group key -> methods graded ok, the number that may only ever go up. */
type Baseline = Record<string, number>;

export function toBaseline(result: ParityResult): Baseline {
  return {
    ...Object.fromEntries(result.groups.map(group => [`${group.player}:${group.group}`, group.ok])),
    // The string surfaces ratchet too. An event name or an error code silently
    // dropping is the same regression as a method going missing, and neither
    // belongs to a method group.
    'events': result.events.present,
    'errors': result.errors.present,
    // Every plugin ratchets on its own, for the same reason each method group
    // does: "the chrome is empty" and "casting is done" are different facts and
    // one total hides both.
    ...Object.fromEntries(comparePlugins().filter(entry => entry.isPlugin).map(entry => [`plugin:${entry.plugin}`, entry.present])),
    // Counted as a negative that may only fall: a key nothing can reach is a
    // promise to a consumer that the library cannot keep.
    'reachable-events': nativeEmissions().reachable.length,
  };
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

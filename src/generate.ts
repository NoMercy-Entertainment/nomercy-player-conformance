import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { EventEntry, extractEvents } from './extract-events';
import { extractErrors } from './extract-errors';
import { extractMethods, MethodEntry } from './extract-methods';
import { extractTypes, TypeEntry } from './extract-types';
import { PACKAGES } from './paths';

export interface Provenance {
  /** Version in player-core's package.json at generation time. */
  version: string;
  /** Commit the source was read from. */
  commit: string;
  /** Commits ahead of the tag matching `version`. Non-zero means this contract
   *  describes UNRELEASED source — the version field alone would misrepresent it. */
  commitsAheadOfTag: number;
  /** Uncommitted changes present in the source tree. */
  dirty: boolean;
}

export interface Contract {
  version: string;
  provenance: Provenance;
  events: EventEntry[];
  methods: MethodEntry[];
  errors: string[];
  /** Exported interfaces, aliases, classes and enums under types/, adapters/
   *  and plugins/. The method surface alone reads finished while the types a
   *  caller programs against are absent. */
  types: TypeEntry[];
}

function byKey<T>(key: (item: T) => string): (a: T, b: T) => number {
  return (a, b): number => {
    const ka = key(a);
    const kb = key(b);
    return ka < kb ? -1 : ka > kb ? 1 : 0;
  };
}

// Read from player-core rather than hardcoded: a literal silently describes the
// wrong release the moment the trio publishes, and the natives pin to this field.
export function contractVersion(): string {
  const manifest: string = readFileSync(resolve(PACKAGES.core, 'package.json'), 'utf8');
  const parsed: { version?: unknown } = JSON.parse(manifest);

  if (typeof parsed.version !== 'string') {
    throw new Error('nomercy-player-core/package.json has no string "version"');
  }

  return parsed.version;
}

function git(args: string): string {
  return execFileSync('git', args.split(' '), { cwd: PACKAGES.core, encoding: 'utf8' }).trim();
}

// The version alone is a lie whenever source sits ahead of its tag: the generator
// reads the working tree, not the published tarball. Provenance makes that visible
// instead of letting a stale-or-early contract look authoritative.
export function provenance(): Provenance {
  const version: string = contractVersion();
  const commit: string = git('rev-parse --short HEAD');
  const dirty: boolean = git('status --porcelain') !== '';

  let commitsAheadOfTag: number = 0;

  try {
    commitsAheadOfTag = Number(git(`rev-list --count v${version}..HEAD`));
  }
  catch {
    commitsAheadOfTag = -1; // no tag for this version yet
  }

  return { version, commit, commitsAheadOfTag, dirty };
}

export function buildContract(): Contract {
  const events = extractEvents().sort(byKey(e => `${e.map}:${e.name}`));
  const methods = extractMethods().sort(byKey(m => `${m.player}:${m.name}`));
  const errors = extractErrors();
  const types = extractTypes().sort(byKey(t => `${t.area}:${t.name}`));

  return { version: contractVersion(), provenance: provenance(), events, methods, errors, types };
}

const CONTRACT_PATH: string = `${dirname(fileURLToPath(import.meta.url))}/../contract/contract.json`;

// Entrypoint: `yarn generate`.
if (process.argv[1]?.endsWith('generate.ts')) {
  mkdirSync(dirname(CONTRACT_PATH), { recursive: true });
  writeFileSync(CONTRACT_PATH, `${JSON.stringify(buildContract(), null, 2)}\n`);
  process.stdout.write(`wrote ${CONTRACT_PATH}\n`);
}

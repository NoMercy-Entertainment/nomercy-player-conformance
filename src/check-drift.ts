import { readFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildContract, Contract } from './generate';

const CONTRACT_PATH: string = `${dirname(fileURLToPath(import.meta.url))}/../contract/contract.json`;

export interface ReleaseCheck {
  ok: boolean;
  reason: string;
}

// The native ports pin to this file and implement whatever it says. When the
// source sits ahead of its tag, "whatever it says" includes changes nobody has
// published, so a native library would ship a symbol that no web consumer has.
//
// That is not hypothetical: at 2.0.1 this contract already carried the
// MediaList `current` -> `item` rename from commit 523bf4b, which is not in the
// published release. The version field said 2.0.1 and meant something else.
export function checkReleased(contract: Contract): ReleaseCheck {
  const { version, commitsAheadOfTag, dirty } = contract.provenance;

  if (dirty) {
    return { ok: false, reason: 'the source tree has uncommitted changes, so this contract describes nothing reproducible' };
  }

  if (commitsAheadOfTag < 0) {
    return { ok: false, reason: `no v${version} tag exists, so there is no released surface to describe` };
  }

  if (commitsAheadOfTag > 0) {
    return {
      ok: false,
      reason:
        `the source is ${commitsAheadOfTag} commit(s) ahead of v${version}, so this contract describes `
        + 'unreleased API. Publish the trio before a native port pins to it',
    };
  }

  // Said out loud, even when it passes. An empty reason on the happy path is
  // indistinguishable from a check that returned before it looked at anything,
  // and this is the one that decides whether a native port may pin to a
  // contract at all.
  return { ok: true, reason: `v${version}, clean and at its tag` };
}

// commit, commitsAheadOfTag and dirty say where the sibling repo's HEAD sits on
// the day of the run. They change on every commit to player-core, so a byte
// comparison failed on commits that touched no API. They stay in the file as
// provenance and stay covered by checkReleased; drift compares the surface and
// the version the native ports pin to.
const VOLATILE_PROVENANCE: readonly string[] = ['commit', 'commitsAheadOfTag', 'dirty'];

export function comparableContract(serialized: string): string {
  const parsed: { provenance?: Record<string, unknown> } = JSON.parse(serialized);
  for (const key of VOLATILE_PROVENANCE) delete parsed.provenance?.[key];
  return `${JSON.stringify(parsed, null, 2)}\n`;
}

export function checkDrift(): { ok: boolean; diff: string } {
  const fresh = comparableContract(JSON.stringify(buildContract()));
  const committed = comparableContract(readFileSync(CONTRACT_PATH, 'utf8'));

  if (fresh === committed) return { ok: true, diff: '' };

  const freshLines = fresh.split('\n');
  const committedLines = committed.split('\n');
  const at = freshLines.findIndex((line, i) => line !== committedLines[i]);

  return { ok: false, diff: `line ${at + 1}: committed=${committedLines[at] ?? '<eof>'} fresh=${freshLines[at] ?? '<eof>'}` };
}

// Two checks with two different jobs, and they are not both gates on every push.
//
// Drift — does the committed contract still match what the generator produces —
// is the daily invariant, and it fails the build.
//
// Released-ness is a publish gate. It is true and useful, and it is also true
// on every push where anything at all is unpublished, which is most of them.
// Failing every push on it taught nobody anything and would have been silenced
// within a week. It runs everywhere and says so loudly; it only fails the build
// under --require-released, which is what a release run passes.
if (process.argv[1]?.endsWith('check-drift.ts')) {
  const result = checkDrift();
  if (!result.ok) {
    process.stderr.write(`Player contract drift: ${result.diff}\nRun 'npm run generate' and commit.\n`);
    process.exit(1);
  }

  const release = checkReleased(buildContract());
  if (!release.ok) {
    const message = `Player contract is not a released surface: ${release.reason}\n`;
    if (process.argv.includes('--require-released')) {
      process.stderr.write(message);
      process.exit(1);
    }
    process.stdout.write(`WARNING: ${message}`);
  }

  process.stdout.write('Player contract up to date.\n');
}

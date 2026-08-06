import { readFileSync } from 'node:fs';

import { kotlinSourceFiles } from './native-strings';

// A declared event is not an emitted one.
//
// Event names graded 175/175 while `fetch:start`, `fetch:retry` and
// `fetch:complete` were fired by nothing at all — the keys existed, the payload
// classes existed, and no line in the library ever called emit with them. A
// consumer subscribing got silence, and every count said the surface complete.
//
// What this can and cannot prove:
//
// It CANNOT prove an event is emitted. Emission goes through helpers —
// `allowed(CoreEvents.BeforePlay, opts, CoreEvents.PlayPrevented)` dispatches
// two events and contains the word emit nowhere — so "no emit(Key) call site"
// is a guess and reporting it as a finding produced eleven false accusations
// on the first run. Proving emission needs the player running, which is the
// scenario harness's job, not a regex's.
//
// It CAN prove an event is dead. A key referenced nowhere outside the file that
// declares it cannot reach a listener by any path, helper or otherwise. That is
// the whole `fetch:*` family, and it is a fact rather than a suspicion.

// The type argument nests — `EventKey<BeforeEvent<ActionOptions>>` — so a
// `[^>]*` body stops at the first `>` and every before-event goes unread.
const DECLARATION = /val\s+(\w+)\s*:\s*EventKey<[\s\S]*?>\s*=\s*EventKey(?:<[\s\S]*?>)?\("([^"]+)"\)/g;

export interface EmissionResult {
  /** Wire names whose key is referenced somewhere other than its declaration. */
  reachable: string[];
  /**
   * Wire names whose key appears only in the file that declares it — and in
   * the registry list beside it, which is the same file. Nothing can emit
   * these and nothing can subscribe usefully to them.
   */
  dead: string[];
}

export function nativeEmissions(): EmissionResult {
  const sources: string[] = kotlinSourceFiles();
  const texts = new Map<string, string>();
  for (const file of sources) texts.set(file, readFileSync(file, 'utf8'));

  const declaredIn = new Map<string, { file: string; wire: string }>();
  for (const [file, text] of texts) {
    for (const match of text.matchAll(DECLARATION)) {
      declaredIn.set(match[1], { file, wire: match[2] });
    }
  }

  const reachable: string[] = [];
  const dead: string[] = [];

  for (const origin of declaredIn.values()) {
    // Word-boundary match on the symbol, in every file but the declaring one.
    const used: boolean = [...texts].some(([file, text]) =>
      file !== origin.file && new RegExp(`\\b${origin.symbol}\\b`).test(text));

    if (used) reachable.push(origin.wire);
    else dead.push(origin.wire);
  }

  return { reachable: [...new Set(reachable)].sort(), dead: [...new Set(dead)].sort() };
}

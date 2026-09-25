import { readFileSync } from 'node:fs';
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { NATIVE } from './paths';

// Which methods are excused is the repos' decision, not this tool's.
//
// Each library already carries that ledger in its own conformance gate — the
// set CI fails the build against — and a second list here would be a second
// answer to the same question. It would drift the first time somebody edited
// one, and the report would confidently print the stale one.
//
// So membership comes from the Kotlin sets and only the prose lives here, in
// waivers.json, with the report naming any entry the two disagree about.

const LEDGER = /(?:WEB_ONLY_METHODS|webOnly)[^=]*=\s*setOf\(([\s\S]*?)\n\s*\)/g;
const ENTRY = /"([^"]+)"/g;

function conformanceFiles(dir: string): string[] {
  const found: string[] = [];

  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) found.push(...conformanceFiles(path));
    else if (entry.endsWith('ConformanceTest.kt')) found.push(path);
  }

  return found;
}

// The error catalog's permanent exemptions, and only those. NOT_YET_PORTED is
// deliberately excluded: that file says in its own words that the list
// shrinking is the measure of the port, so those codes are gaps, not excuses.
const ERROR_LEDGER = /(?:WEB_ONLY|NOT_THE_PLAYER)\s*=\s*setOf\(([\s\S]*?)\n\s*\)/g;

/** Error codes the native libraries have declared they will never raise. */
export function excusedErrors(): Set<string> {
  const excused = new Set<string>();

  for (const repo of Object.values(NATIVE)) {
    for (const file of conformanceFiles(join(repo.root, 'src'))) {
      if (!file.endsWith('ErrorCatalogConformanceTest.kt')) continue;

      for (const block of readFileSync(file, 'utf8').matchAll(ERROR_LEDGER)) {
        for (const entry of block[1].matchAll(ENTRY)) excused.add(entry[1]);
      }
    }
  }

  return excused;
}

/** Every method the native libraries have declared they will never carry. */
export function excusedNatively(): Set<string> {
  const excused = new Set<string>();

  for (const repo of Object.values(NATIVE)) {
    for (const file of conformanceFiles(join(repo.root, 'src'))) {
      // Every ledger in the file, not the first: a repo can carry more than
      // one conformance suite and the second one's excuses are just as real.
      for (const block of readFileSync(file, 'utf8').matchAll(LEDGER)) {
        for (const entry of block[1].matchAll(ENTRY)) excused.add(entry[1]);
      }
    }
  }

  return excused;
}

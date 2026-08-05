import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { NATIVE } from './paths';

// Event names and error codes are string values, not declarations.
//
// The ABI dump carries `getAudioTrack(): EventKey` and says nothing about the
// wire name that key holds, and the wire name is the whole contract — a
// consumer subscribes with the string. So these two surfaces are read from the
// Kotlin sources, where the string is written, and only the string is taken.

const EVENT_KEY = /EventKey(?:<[^>]*>)?\("([^"]+)"\)/g;
const ERROR_CODE = /"([a-z0-9-]+:[a-z0-9-]+\/[a-z0-9-]+)"/g;

// Main source sets only.
//
// The conformance suites list every code the port has NOT reached, as string
// literals, so a sweep that included test sources found all of them and
// reported the catalog complete. The ledger of what is missing is not evidence
// that it is there.
function isTestSourceSet(name: string): boolean {
  return /Test$/.test(name);
}

function kotlinSources(dir: string, depth: number = 0): string[] {
  const files: string[] = [];

  for (const entry of readdirSync(dir)) {
    if (depth === 0 && isTestSourceSet(entry)) continue;

    const path = join(dir, entry);
    if (statSync(path).isDirectory()) files.push(...kotlinSources(path, depth + 1));
    else if (entry.endsWith('.kt')) files.push(path);
  }

  return files;
}

// `<repo>/src` plus `<repo>/<module>/src`. Deeper than that is a source set,
// which kotlinSources already walks.
function moduleSources(root: string): string[] {
  const roots: string[] = [];

  for (const entry of ['.', ...readdirSync(root)]) {
    const candidate = join(root, entry, 'src');
    try {
      if (statSync(candidate).isDirectory()) roots.push(candidate);
    }
    catch {
      continue; // not a module
    }
  }

  return roots.flatMap(dir => kotlinSources(dir));
}

function harvest(pattern: RegExp): Set<string> {
  const found = new Set<string>();

  for (const repo of Object.values(NATIVE)) {
    // Every Gradle module, not just the root one. The ASS renderer lives in
    // subtitles-libass and the fakes in testing, so a sweep of `<repo>/src`
    // alone reported three codes as unraised that the library raises.
    for (const file of moduleSources(repo.root)) {
      const text = readFileSync(file, 'utf8');
      for (const match of text.matchAll(pattern)) found.add(match[1]);
    }
  }

  return found;
}

/** Every event name a native library can emit or be subscribed to. */
export function nativeEvents(): Set<string> {
  return harvest(EVENT_KEY);
}

/** Every `namespace:category/reason` code the native libraries raise. */
export function nativeErrors(): Set<string> {
  return harvest(ERROR_CODE);
}

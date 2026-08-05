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

function kotlinSources(dir: string): string[] {
  const files: string[] = [];

  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) files.push(...kotlinSources(path));
    else if (entry.endsWith('.kt')) files.push(path);
  }

  return files;
}

function harvest(pattern: RegExp): Set<string> {
  const found = new Set<string>();

  for (const repo of Object.values(NATIVE)) {
    for (const file of kotlinSources(join(repo.root, 'src'))) {
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

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { NATIVE, REPO_ROOT } from './paths';

// The chrome cannot be graded by method.
//
// The web chrome is a plugin that builds DOM; the native one is composable
// functions. Neither has a class the other can be diffed against, which is why
// the plugin grader reads `video/desktop-ui` as unported while a working
// transport bar is on screen. Comparing them by SHAPE is the wrong question.
//
// The right one is what a viewer can reach. Both sides name their controls, and
// the native enum says so in its own comment — "a control, by the name the
// web's priority list uses" — so the two inventories are directly comparable
// and a control quietly dropped from either is a finding.

const WEB_CHROME: string = resolve(
  REPO_ROOT,
  'packages',
  'player-web',
  'nomercy-video-player',
  'src',
  'plugins',
  'desktop-ui',
);

// `iconBtn(player, 'seek-back', 'seekBack')` — the id is what the control is.
const WEB_CONTROL = /iconBtn\(\s*(?:player|this[a-zA-Z]*)\s*,\s*'([a-zA-Z0-9_-]+)'/g;

const NATIVE_ENUM = /public enum class ChromeControl \{([\s\S]*?)\n\}/;

// Where the two vocabularies differ, and only there. `playback` is the web's id
// for the play/pause button and `vol-popup-mute` is the mute toggle inside the
// volume popup; the native names are the plain ones.
const SPELLING: Record<string, string> = {
  'playback': 'PLAY',
  'vol-popup-mute': 'MUTE',
  'chapter-back': 'CHAPTER_PREV',
  'chapter-forward': 'CHAPTER_NEXT',
  'aspect-ratio': 'ASPECT_RATIO',
  'seek-back': 'SEEK_BACK',
  'seek-forward': 'SEEK_FORWARD',
};

function typescriptFiles(dir: string): string[] {
  const files: string[] = [];

  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) files.push(...typescriptFiles(path));
    else if (entry.endsWith('.ts')) files.push(path);
  }

  return files;
}

function nativeName(id: string): string {
  return SPELLING[id] ?? id.toUpperCase().replace(/-/g, '_');
}

export interface ChromeResult {
  web: string[];
  native: string[];
  /** Web controls with no native entry — a control a viewer loses on desktop. */
  missing: string[];
  /** Native controls the web chrome does not draw. */
  extra: string[];
}

export function compareChrome(): ChromeResult {
  const ids = new Set<string>();

  for (const file of typescriptFiles(WEB_CHROME)) {
    for (const match of readFileSync(file, 'utf8').matchAll(WEB_CONTROL)) ids.add(match[1]);
  }

  const source: string = readFileSync(
    resolve(NATIVE.video.root, 'src', 'commonMain', 'kotlin', 'tv', 'nomercy', 'player', 'video', 'ui', 'chrome', 'ChromeResponsive.kt'),
    'utf8',
  );

  const block = NATIVE_ENUM.exec(source);
  if (!block) throw new Error('no ChromeControl enum — the chrome inventory moved');

  const native = new Set(
    block[1]
      .split('\n')
      .map(line => line.trim().replace(/,$/, ''))
      .filter(line => /^[A-Z_]+$/.test(line)),
  );

  const web = [...ids].sort();

  return {
    web,
    native: [...native].sort(),
    missing: web.filter(id => !native.has(nativeName(id))).sort(),
    extra: [...native].filter(name => !web.some(id => nativeName(id) === name)).sort(),
  };
}

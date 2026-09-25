import { existsSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here: string = dirname(fileURLToPath(import.meta.url));

// testing/nomercy-player-conformance/parity/src -> the conformance repo is two
// levels up, the workspace root four.
export const CONFORMANCE_ROOT: string = resolve(here, '..', '..');
export const REPO_ROOT: string = resolve(here, '..', '..', '..', '..');

/** The web oracle: the generated contract every native port is graded against. */
export const CONTRACT: string = resolve(CONFORMANCE_ROOT, 'contract', 'contract.json');

/** Reasoned exemptions: what the web declares because it is the web. */
export const WAIVERS: string = resolve(here, '..', 'waivers.json');

export interface NativeRepo {
  name: string;
  root: string;
  /** The JVM ABI dump. Desktop is the JVM target, so this is the desktop surface. */
  jvmApi: string;
}

/**
 * Every JVM ABI dump a library publishes, the root module and its siblings.
 *
 * The chrome, the fakes and the ASS renderer are separate Gradle modules with
 * their own dumps, and reading only the root one reported the entire Compose
 * chrome as unported while 119 public declarations of it sat in
 * `ui-compose/api/jvm`. A consumer takes the artifacts, not the root module.
 */
export function jvmDumps(repo: NativeRepo): string[] {
  const dumps: string[] = [repo.jvmApi];

  for (const entry of readdirSync(repo.root, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;

    const candidate = resolve(repo.root, entry.name, 'api', 'jvm', `${entry.name}.api`);
    if (existsSync(candidate)) dumps.push(candidate);
  }

  return dumps;
}

const NATIVE_ROOT: string = resolve(REPO_ROOT, 'packages', 'player-kmp');

export const NATIVE: Record<'core' | 'video' | 'music', NativeRepo> = {
  core: {
    name: 'nomercy-player-core-kmp',
    root: resolve(NATIVE_ROOT, 'nomercy-player-core-kmp'),
    jvmApi: resolve(NATIVE_ROOT, 'nomercy-player-core-kmp', 'api', 'jvm', 'nomercy-player-core-kmp.api'),
  },
  video: {
    name: 'nomercy-video-player-kmp',
    root: resolve(NATIVE_ROOT, 'nomercy-video-player-kmp'),
    jvmApi: resolve(NATIVE_ROOT, 'nomercy-video-player-kmp', 'api', 'jvm', 'nomercy-video-player-kmp.api'),
  },
  music: {
    name: 'nomercy-music-player-kmp',
    root: resolve(NATIVE_ROOT, 'nomercy-music-player-kmp'),
    jvmApi: resolve(NATIVE_ROOT, 'nomercy-music-player-kmp', 'api', 'jvm', 'nomercy-music-player-kmp.api'),
  },
};

/** The concrete player class each web player is ported to. */
export const PLAYER_CLASS: Record<'video' | 'music', string> = {
  video: 'tv/nomercy/player/video/NMVideoPlayer',
  music: 'tv/nomercy/player/music/NMMusicPlayer',
};

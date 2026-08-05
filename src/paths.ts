import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here: string = dirname(fileURLToPath(import.meta.url));

// tools/player-parity/src -> repo root is three levels up.
export const REPO_ROOT: string = resolve(here, '..', '..', '..');

/** The web oracle: the generated contract every native port is graded against. */
export const CONTRACT: string = resolve(REPO_ROOT, 'tools', 'player-contract', 'contract', 'contract.json');

/** Reasoned exemptions: what the web declares because it is the web. */
export const WAIVERS: string = resolve(here, '..', 'waivers.json');

export interface NativeRepo {
  name: string;
  root: string;
  /** The JVM ABI dump. Desktop is the JVM target, so this is the desktop surface. */
  jvmApi: string;
}

const NATIVE_ROOT: string = resolve(REPO_ROOT, 'packages-native');

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

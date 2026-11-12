import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here: string = dirname(fileURLToPath(import.meta.url));

// testing/nomercy-player-conformance/src → repo root is three levels up.
export const REPO_ROOT: string = resolve(here, '..', '..', '..');

// The three web packages live in one repo, nomercy-player-web. NM_PLAYER_WEB points at
// another checkout of it, for a run from a worktree.
export const PLAYER_WEB: string = process.env.NM_PLAYER_WEB
  ?? resolve(REPO_ROOT, 'packages', 'player-web', 'nomercy-player-web');

export const PACKAGES: { core: string; video: string; music: string } = {
  core: resolve(PLAYER_WEB, 'packages', 'core'),
  video: resolve(PLAYER_WEB, 'packages', 'video-player'),
  music: resolve(PLAYER_WEB, 'packages', 'music-player'),
};

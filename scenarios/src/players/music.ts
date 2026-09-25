// -----------------------------------------------------------------------------
//  Copyright (c) NoMercy Entertainment
//
//  Licensed under the Apache License, Version 2.0. See LICENSE for details.
//
//  SPDX-License-Identifier: Apache-2.0
// -----------------------------------------------------------------------------

// The audio twin of `players/video.ts` — `options.backendFactory` on
// `NMMusicPlayer` is the same unconditional seam (`_createBackend` in the
// trio's `index.ts`), so a real player mounts headless over
// `ScenarioAudioBackend` with no patching and no changes under `packages/`.

import type { MusicPlayerConfig, MusicPlaylistItem } from '@nomercy-entertainment/nomercy-music-player';
import { NMMusicPlayer } from '@nomercy-entertainment/nomercy-music-player';
import { ScenarioAudioBackend } from '../scenario-backend';

let mountCounter = 0;

/**
 * Construct a real, headless `NMMusicPlayer` wired to a fresh
 * `ScenarioAudioBackend`. Mirrors `buildVideoPlayer` — seeds `opts.playlist`
 * via the real `queue()` API after `setup()`, and exposes the fake as
 * `player.__scenarioBackend` for the scenario runner's `backend` actions.
 */
export async function buildMusicPlayer(opts: {
  playlist?: MusicPlaylistItem[];
  config?: MusicPlayerConfig<MusicPlaylistItem>;
}): Promise<{
  player: NMMusicPlayer<MusicPlaylistItem> & { readonly __scenarioBackend: ScenarioAudioBackend };
  dispose: () => Promise<void>;
}> {
  const id = `player-scenarios-music-${mountCounter++}`;
  const container = document.createElement('div');
  container.id = id;
  document.body.appendChild(container);

  const backend = new ScenarioAudioBackend();
  const player = Object.assign(new NMMusicPlayer<MusicPlaylistItem>(id), { __scenarioBackend: backend });

  player.setup({
    ...opts.config,
    backendFactory: () => backend,
  });

  if (opts.playlist)
    player.queue(opts.playlist);

  // See `buildVideoPlayer` — wait out the async setup pipeline so a caller
  // driving transport methods immediately after construction never races
  // `ready()`'s own in-flight stage events into a firehose capture.
  await player.ready();

  const dispose = async (): Promise<void> => {
    await player.dispose();
    container.remove();
  };

  return { player, dispose };
}

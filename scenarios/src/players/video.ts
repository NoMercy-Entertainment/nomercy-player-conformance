// -----------------------------------------------------------------------------
//  Copyright (c) NoMercy Entertainment
//
//  Licensed under the Apache License, Version 2.0. See LICENSE for details.
//
//  SPDX-License-Identifier: Apache-2.0
// -----------------------------------------------------------------------------

// The `options.backendFactory` seam (`_createBackend` in the trio's `index.ts`)
// is used for EVERY backend kind when supplied, including the default `html5`
// kind — a real `NMVideoPlayer` mounts headless over `ScenarioBackend` with no
// patching and no changes under `packages/`. The full DOM-mounted medium
// player constructs fine under happy-dom for this reason: `Html5VideoBackend`
// (the one adapter that would need `<video>`/`MediaSource`) is never built.

import type { VideoPlayerConfig, VideoPlaylistItem } from '@nomercy-entertainment/nomercy-video-player';
import { NMVideoPlayer } from '@nomercy-entertainment/nomercy-video-player';
import { ScenarioBackend } from '../scenario-backend';

let mountCounter = 0;

/**
 * Construct a real, headless `NMVideoPlayer` wired to a fresh
 * `ScenarioBackend`. Seeds `opts.playlist` via the real `queue()` API after
 * `setup()`, so `expect(seen)` observers only ever see events the trio itself
 * emits. `player.__scenarioBackend` exposes the fake so scenario `backend`
 * actions can drive it directly.
 */
export async function buildVideoPlayer(opts: {
  playlist?: VideoPlaylistItem[];
  config?: VideoPlayerConfig<VideoPlaylistItem>;
  /**
   * Substitute backend. Exists so the drift proof can hand in one that
   * deliberately misbehaves: a conformance runner nobody has watched fail is
   * a runner nobody knows works.
   */
  backend?: ScenarioBackend;
}): Promise<{
  player: NMVideoPlayer<VideoPlaylistItem> & { readonly __scenarioBackend: ScenarioBackend };
  dispose: () => Promise<void>;
}> {
  const id = `player-scenarios-video-${mountCounter++}`;
  const container = document.createElement('div');
  container.id = id;
  document.body.appendChild(container);

  const backend = opts.backend ?? new ScenarioBackend();
  const player = Object.assign(new NMVideoPlayer<VideoPlaylistItem>(id), { __scenarioBackend: backend });

  player.setup({
    ...opts.config,
    backendFactory: () => backend,
  });

  if (opts.playlist)
    player.queue(opts.playlist);

  // Wait out the async setup pipeline before handing the player back — a
  // caller that drives transport methods immediately after construction
  // would otherwise race `ready()`'s own in-flight `setupStart` /
  // `configResolved` / `pluginsRegistering` / … stage events into whatever
  // firehose capture it runs.
  await player.ready();

  const dispose = async (): Promise<void> => {
    await player.dispose();
    container.remove();
  };

  return { player, dispose };
}

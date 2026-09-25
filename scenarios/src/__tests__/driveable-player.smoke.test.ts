// -----------------------------------------------------------------------------
//  Copyright (c) NoMercy Entertainment
//
//  Licensed under the Apache License, Version 2.0. See LICENSE for details.
//
//  SPDX-License-Identifier: Apache-2.0
// -----------------------------------------------------------------------------

import { describe, expect, it } from 'vitest';

import { beforeEventNames, capture } from '../capture';
import { buildVideoPlayer } from '../players/video';

describe('driveable player seam', () => {
  it('a real NMVideoPlayer + fake backend emits the canonical play sequence', async () => {
    const { player, dispose } = await buildVideoPlayer({ playlist: [{ id: 'a', title: 'A' }], config: {} });
    const observed = capture(player);

    await player.play();

    // Core transport dispatches beforePlay, then emits play; the fake backend
    // re-emits playing through the real bridge.
    const seen = observed.seen;
    expect(seen).toContain('beforePlay');
    expect(seen).toContain('play');
    expect(seen).toContain('playing');
    expect(seen.indexOf('beforePlay')).toBeLessThan(seen.indexOf('play'));

    observed.stop();
    await dispose();
  });

  it('the firehose alone cannot see a before-hook, which is why capture exists', async () => {
    const { player, dispose } = await buildVideoPlayer({ playlist: [{ id: 'a', title: 'A' }], config: {} });
    const firehoseOnly: string[] = [];
    player.on('all', (name: string) => firehoseOnly.push(name));

    await player.play();

    // runDispatchBefore invokes listenersOf(name) directly and never emit(), so
    // no before-hook can reach on('all'). If this ever starts failing, the trio
    // changed how before-dispatch works and capture.ts can be simplified.
    expect(firehoseOnly).toContain('play');
    expect(firehoseOnly).not.toContain('beforePlay');

    await dispose();
  });

  it('knows every before-event the contract records', () => {
    const names = beforeEventNames();

    expect(names).toContain('beforePlay');
    expect(names).toContain('beforeSeek');
    // Twenty at contract 2.0.1. Asserting a floor rather than the exact count so
    // a new before-event added upstream does not redden this for no reason.
    expect(names.length).toBeGreaterThanOrEqual(20);
  });
});

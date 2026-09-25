// -----------------------------------------------------------------------------
//  Copyright (c) NoMercy Entertainment
//
//  Licensed under the Apache License, Version 2.0. See LICENSE for details.
//
//  SPDX-License-Identifier: Apache-2.0
// -----------------------------------------------------------------------------

// A conformance runner nobody has watched fail is a runner nobody knows works.
//
// Every test here plants a real behaviour change in the backend the player is
// driving, runs a real scenario against it, and asserts the runner reports the
// failure and names the event that went missing. If one of these ever passes
// green with the drift planted, the harness has stopped measuring anything and
// the native conformance suites built on it would inherit the blind spot.

import { describe, expect, it } from 'vitest';

import { capture } from '../capture';
import { buildVideoPlayer } from '../players/video';
import { firstUnmatched } from '../runner';
import { ScenarioBackend } from '../scenario-backend';

/** Plays, but never admits it started. */
class SilentStartBackend extends ScenarioBackend {
  override async play(): Promise<void> {
    this.script('play');
  }
}

/** Reports the end of the item as a stall instead. */
class MislabellingBackend extends ScenarioBackend {
  override script(event: string, args: unknown[] = []): void {
    super.script(event === 'ended' ? 'stalled' : event, args);
  }
}

async function observe(backend: ScenarioBackend, drive: (player: never) => Promise<void>): Promise<string[]> {
  const { player, dispose } = await buildVideoPlayer({
    playlist: [{ id: 'a', title: 'A', url: 'https://example.test/a' }] as never,
    backend,
  });
  const observed = capture(player);
  await drive(player as never);
  await new Promise<void>((resolve) => {
    setTimeout(resolve, 0);
  });
  const seen = [...observed.seen];
  observed.stop();
  await dispose();
  return seen;
}

describe('planted drift', () => {
  it('a backend that stops emitting playing is caught, and the report names it', async () => {
    const expected = ['beforePlay', 'play', 'playing'];

    const healthy = await observe(new ScenarioBackend(), async (player: never) => {
      await (player as { play: () => Promise<void> }).play();
    });
    const drifted = await observe(new SilentStartBackend(), async (player: never) => {
      await (player as { play: () => Promise<void> }).play();
    });

    expect(firstUnmatched(expected, healthy)).toBe(-1);
    // Index 2 is "playing" — the runner points at the exact event that vanished.
    expect(firstUnmatched(expected, drifted)).toBe(2);
    expect(expected[firstUnmatched(expected, drifted)]).toBe('playing');
  }, 30_000);

  it('a backend that relabels one event is caught by the scenario that expects the original', async () => {
    const drive = async (player: never): Promise<void> => {
      const typed = player as { play: () => Promise<void>; __scenarioBackend: ScenarioBackend };
      await typed.play();
      typed.__scenarioBackend.script('ended');
    };

    const healthy = await observe(new ScenarioBackend(), drive);
    const drifted = await observe(new MislabellingBackend(), drive);

    expect(healthy).toContain('ended');
    expect(drifted).not.toContain('ended');
    expect(firstUnmatched(['play', 'ended'], drifted)).toBe(1);
  }, 30_000);

  it('the healthy and drifted runs differ only in the planted event', async () => {
    // Guards the proof itself: if the two runs diverged for some unrelated
    // reason, the assertions above would pass without the drift being what
    // caused them.
    const drive = async (player: never): Promise<void> => {
      await (player as { play: () => Promise<void> }).play();
    };

    const healthy = await observe(new ScenarioBackend(), drive);
    const drifted = await observe(new SilentStartBackend(), drive);

    const removed = healthy.filter(name => !drifted.includes(name));
    const added = drifted.filter(name => !healthy.includes(name));

    expect(removed).toEqual(['playing']);
    expect(added).toEqual([]);
  }, 30_000);
});

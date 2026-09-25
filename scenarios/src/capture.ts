// -----------------------------------------------------------------------------
//  Copyright (c) NoMercy Entertainment
//
//  Licensed under the Apache License, Version 2.0. See LICENSE for details.
//
//  SPDX-License-Identifier: Apache-2.0
// -----------------------------------------------------------------------------

import { readFileSync } from 'node:fs';

import { CONTRACT_PATH } from './paths';

/**
 * The firehose alone cannot see the cancellable seam.
 *
 * `on('all', fn)` is fed by `emit()` and by nothing else. The before-hooks never
 * go through `emit()`: `runDispatchBefore` (`player-core/src/core/dispatch.ts`,
 * around line 141) reaches for `target.listenersOf(eventName)` and invokes the
 * listeners directly, because `stopImmediatePropagation()` needs synchronous
 * iteration and `emit()` is fire-and-forget.
 *
 * So all 20 `before*` events in the contract are structurally invisible to a
 * firehose observer. A scenario harness that captured only through `on('all')`
 * would have silently asserted nothing about preventDefault, delay gating or
 * propagation — the exact seam the live-transcoding plugin is built on, and the
 * main reason this harness exists.
 *
 * Capturing therefore subscribes to each before-event by name in addition to the
 * firehose. Both paths push into one array at call time, so interleaved ordering
 * is preserved without any merging step.
 */
export interface Capture {
  /** Event names in the order they were observed. */
  readonly seen: readonly string[];
  /** Name and payload pairs, for assertions that care about the payload. */
  readonly entries: readonly { name: string; data: unknown }[];
  stop: () => void;
}

interface Observable {
  on: (event: string, fn: (...args: unknown[]) => void) => unknown;
  off?: (event: string, fn: (...args: unknown[]) => void) => unknown;
}

let cachedBeforeNames: string[] | undefined;

/** Every `before*` event name the generated contract records. */
export function beforeEventNames(): string[] {
  if (cachedBeforeNames)
    return cachedBeforeNames;

  const contract: { events?: { name?: unknown }[] } = JSON.parse(readFileSync(CONTRACT_PATH, 'utf8'));
  const names = new Set<string>();

  for (const event of contract.events ?? []) {
    if (typeof event.name === 'string' && event.name.startsWith('before'))
      names.add(event.name);
  }

  cachedBeforeNames = [...names].sort();
  return cachedBeforeNames;
}

/**
 * Observe every event a player emits, including the before-hooks the firehose
 * cannot reach.
 */
export function capture(player: Observable): Capture {
  const entries: { name: string; data: unknown }[] = [];
  const removers: (() => void)[] = [];

  const firehose = (name: unknown, data: unknown): void => {
    entries.push({ name: String(name), data });
  };
  player.on('all', firehose);
  removers.push(() => player.off?.('all', firehose));

  for (const name of beforeEventNames()) {
    const listener = (data: unknown): void => {
      entries.push({ name, data });
    };
    player.on(name, listener);
    removers.push(() => player.off?.(name, listener));
  }

  return {
    get seen(): readonly string[] {
      return entries.map(entry => entry.name);
    },
    get entries(): readonly { name: string; data: unknown }[] {
      return entries;
    },
    stop: (): void => {
      for (const remove of removers) remove();
      removers.length = 0;
    },
  };
}

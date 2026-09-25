// -----------------------------------------------------------------------------
//  Copyright (c) NoMercy Entertainment
//
//  Licensed under the Apache License, Version 2.0. See LICENSE for details.
//
//  SPDX-License-Identifier: Apache-2.0
// -----------------------------------------------------------------------------

import type { Capture } from './capture';
import type { Action, Scenario, ScenarioFile } from './schema';
import { readFileSync } from 'node:fs';
import { capture } from './capture';
import { CONTRACT_PATH } from './paths';
import { buildMusicPlayer } from './players/music';
import { buildVideoPlayer } from './players/video';

export type Medium = 'video' | 'music';

export interface ScenarioResult {
  id: string;
  medium: Medium;
  ok: boolean;
  expected: string[];
  /** Contract-named events the player emitted, in order. */
  observed: string[];
  /** Set when the run failed: what went wrong, in one sentence. */
  reason?: string;
}

interface DrivenPlayer {
  __scenarioBackend: { script: (event: string, args?: unknown[]) => void };
  on: (event: string, fn: (...args: unknown[]) => void) => unknown;
  dispose?: () => unknown;
  [method: string]: unknown;
}

/**
 * Emitted by the act of subscribing, so observing changes what is observed:
 * `capture()` registers twenty-one listeners and every one of them produces a
 * `listeners-changed`. It is a devtools signal, not player behaviour, and a
 * scenario that asserted on it would be asserting on the observer.
 */
const OBSERVER_ARTEFACTS: ReadonlySet<string> = new Set(['listeners-changed']);

let cachedContractNames: Set<string> | undefined;

/**
 * Every event name the generated contract knows about.
 *
 * Observation is filtered through this on the way in. A player emits things the
 * contract does not describe — internal staging, per-library extras — and a
 * conformance suite that compared those would fail for reasons that say nothing
 * about conformance. It also runs the other way: an `expect` naming an event
 * outside the contract is an authoring mistake, because the whole point is to
 * assert on the surface all three ecosystems share.
 */
export function contractEventNames(): Set<string> {
  if (cachedContractNames)
    return cachedContractNames;

  const contract: { events?: { name?: unknown }[] } = JSON.parse(readFileSync(CONTRACT_PATH, 'utf8'));
  cachedContractNames = new Set(
    (contract.events ?? []).map(event => event.name).filter((name): name is string => typeof name === 'string'),
  );
  return cachedContractNames;
}

/**
 * Does `expected` appear inside `observed`, in order?
 *
 * A subsequence rather than an exact list, deliberately. A scenario says what
 * must happen and in what order; it does not say nothing else may happen, because
 * what else happens legitimately differs between video and music and between
 * releases. Removing an event, or emitting two in the wrong order, still fails —
 * those are the drifts worth catching. An event appearing that no scenario
 * mentions is the contract generator's job, not this one's.
 *
 * Returns the index of the first expected name that could not be matched, or -1
 * when the whole sequence matched.
 */
export function firstUnmatched(expected: readonly string[], observed: readonly string[]): number {
  let cursor = 0;
  for (let index = 0; index < expected.length; index++) {
    const found = observed.indexOf(expected[index], cursor);
    if (found === -1)
      return index;
    cursor = found + 1;
  }
  return -1;
}

/** Let the trio's async dispatch settle before the next action or the compare. */
async function settle(): Promise<void> {
  await new Promise<void>((resolve) => {
    setTimeout(resolve, 0);
  });
}

async function applyAction(player: DrivenPlayer, action: Action): Promise<void> {
  // A prevention is wired before the action it cancels, so it must be its own
  // step in the script rather than a flag on the method that follows it.
  if (action.preventVia) {
    player.on(action.preventVia, (event: unknown) => {
      (event as { preventDefault?: () => void }).preventDefault?.();
    });
    return;
  }

  if (action.backend) {
    player.__scenarioBackend.script(action.backend, action.args ?? []);
    await settle();
    return;
  }

  const method = player[action.method as string];
  if (typeof method !== 'function')
    throw new TypeError(`scenario calls ${action.method}(), which this player does not have`);

  await (method as (...args: unknown[]) => unknown).apply(player, action.args ?? []);
  await settle();
}

async function build(medium: Medium, scenario: Scenario): Promise<{ player: DrivenPlayer; dispose: () => Promise<void> }> {
  const opts = { playlist: scenario.playlist as never, config: scenario.config as never };
  const built = medium === 'video' ? await buildVideoPlayer(opts) : await buildMusicPlayer(opts);
  return { player: built.player as unknown as DrivenPlayer, dispose: built.dispose };
}

/** Run one scenario against one medium and report what the player did. */
export async function runScenario(scenario: Scenario, medium: Medium): Promise<ScenarioResult> {
  const names = contractEventNames();
  const unknown = scenario.expect.filter(name => !names.has(name));
  if (unknown.length > 0) {
    return {
      id: scenario.id,
      medium,
      ok: false,
      expected: scenario.expect,
      observed: [],
      reason: `expects ${unknown.join(', ')}, which the contract does not define`,
    };
  }

  const { player, dispose } = await build(medium, scenario);
  const observed: Capture = capture(player as never);

  try {
    for (const action of scenario.actions) await applyAction(player, action);
    await settle();
  }
  catch (error) {
    observed.stop();
    await dispose();
    return {
      id: scenario.id,
      medium,
      ok: false,
      expected: scenario.expect,
      observed: [],
      reason: error instanceof Error ? error.message : String(error),
    };
  }

  const seen = observed.seen.filter(name => names.has(name) && !OBSERVER_ARTEFACTS.has(name));
  observed.stop();
  await dispose();

  const failedAt = firstUnmatched(scenario.expect, seen);
  return {
    id: scenario.id,
    medium,
    ok: failedAt === -1,
    expected: scenario.expect,
    observed: seen,
    reason: failedAt === -1
      ? undefined
      : `expected "${scenario.expect[failedAt]}" after ${scenario.expect.slice(0, failedAt).join(' → ') || 'the start'}, and it never arrived in that order`,
  };
}

/** Every scenario against every medium it declares. */
export async function runAll(file: ScenarioFile): Promise<ScenarioResult[]> {
  const results: ScenarioResult[] = [];
  for (const scenario of file.scenarios) {
    const media: Medium[] = scenario.medium === 'both' ? ['video', 'music'] : [scenario.medium];
    for (const medium of media) results.push(await runScenario(scenario, medium));
  }
  return results;
}

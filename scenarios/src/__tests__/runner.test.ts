// -----------------------------------------------------------------------------
//  Copyright (c) NoMercy Entertainment
//
//  Licensed under the Apache License, Version 2.0. See LICENSE for details.
//
//  SPDX-License-Identifier: Apache-2.0
// -----------------------------------------------------------------------------

import type { ScenarioFile } from '../schema';
import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';
import { SCENARIOS_PATH } from '../paths';
import { contractEventNames, firstUnmatched, runAll, runScenario } from '../runner';
import { validateScenarioFile } from '../schema';

const file: ScenarioFile = JSON.parse(readFileSync(SCENARIOS_PATH, 'utf8'));

describe('ordered matching', () => {
  it('accepts the expected names appearing in order with anything in between', () => {
    expect(firstUnmatched(['a', 'c'], ['a', 'b', 'c', 'd'])).toBe(-1);
  });

  it('rejects a missing event and points at it', () => {
    expect(firstUnmatched(['a', 'c'], ['a', 'b', 'd'])).toBe(1);
  });

  it('rejects the right events in the wrong order', () => {
    // This is the drift that matters most: beforePlay after play means the
    // cancellable seam stopped being cancellable.
    expect(firstUnmatched(['play', 'beforePlay'], ['beforePlay', 'play'])).toBe(1);
  });

  it('needs one observation per expectation, so a repeat is not satisfied twice', () => {
    expect(firstUnmatched(['a', 'a'], ['a'])).toBe(1);
    expect(firstUnmatched(['a', 'a'], ['a', 'a'])).toBe(-1);
  });
});

describe('the scenario set', () => {
  it('validates against its own schema', () => {
    const result = validateScenarioFile(file);
    expect(result.errors).toEqual([]);
    expect(result.ok).toBe(true);
  });

  it('only asserts on events the contract defines', () => {
    const names = contractEventNames();
    const unknown = file.scenarios.flatMap(s => s.expect.filter(name => !names.has(name)));

    expect(unknown).toEqual([]);
  });

  it('gives every scenario a unique id', () => {
    const ids = file.scenarios.map(s => s.id);

    expect(new Set(ids).size).toBe(ids.length);
  });

  it('covers the cancellable seam, not just the happy path', () => {
    // A conformance suite that only drives the happy path proves nothing about
    // the seam plugins are built on.
    const prevented = file.scenarios.filter(s => s.actions.some(a => a.preventVia));

    expect(prevented.length).toBeGreaterThanOrEqual(5);
  });
});

describe('running against the real trio', () => {
  it('a real player emits the canonical play sequence', async () => {
    const scenario = file.scenarios.find(s => s.id === 'transport/play')!;

    const result = await runScenario(scenario, 'video');

    expect(result.reason).toBeUndefined();
    expect(result.ok).toBe(true);
  });

  it('refusing beforePlay stops playback on a real player', async () => {
    const scenario = file.scenarios.find(s => s.id === 'transport/play-prevented')!;

    const result = await runScenario(scenario, 'video');

    expect(result.reason).toBeUndefined();
    expect(result.observed).not.toContain('playing');
  });

  it('a scenario naming an event outside the contract is reported, not passed', async () => {
    const result = await runScenario(
      {
        id: 'invented/event',
        name: 'asserts something the contract has never heard of',
        medium: 'video',
        actions: [{ method: 'play' }],
        expect: ['definitelyNotAContractEvent'],
      },
      'video',
    );

    expect(result.ok).toBe(false);
    expect(result.reason).toContain('the contract does not define');
  });

  it('a scenario calling a method the player lacks fails loudly', async () => {
    const result = await runScenario(
      {
        id: 'invented/method',
        name: 'calls something that is not there',
        medium: 'video',
        actions: [{ method: 'teleport' }],
        expect: ['play'],
      },
      'video',
    );

    expect(result.ok).toBe(false);
    expect(result.reason).toContain('teleport');
  });

  it('every scenario in the set passes against both real players', async () => {
    const results = await runAll(file);
    const failures = results.filter(r => !r.ok).map(r => `${r.id} [${r.medium}]: ${r.reason}`);

    expect(failures).toEqual([]);
    expect(results.length).toBeGreaterThan(file.scenarios.length);
  }, 60_000);
});

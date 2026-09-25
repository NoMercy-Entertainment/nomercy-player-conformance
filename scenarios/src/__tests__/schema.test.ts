// -----------------------------------------------------------------------------
//  Copyright (c) NoMercy Entertainment
//
//  Licensed under the Apache License, Version 2.0. See LICENSE for details.
//
//  SPDX-License-Identifier: Apache-2.0
// -----------------------------------------------------------------------------

import { describe, expect, it } from 'vitest';

import { validateScenarioFile } from '../schema';

describe('scenario schema', () => {
  it('accepts a minimal valid method-action scenario', () => {
    const doc = {
      contractVersion: '2.0.0',
      scenarios: [{ id: 'play/basic', name: 'play', medium: 'both', actions: [{ method: 'play' }], expect: ['beforePlay', 'play', 'playing'] }],
    };
    expect(validateScenarioFile(doc).ok).toBe(true);
  });

  it('accepts a backend-driven action', () => {
    const doc = {
      contractVersion: '2.0.0',
      scenarios: [{ id: 'queue/ended', name: 'ended advances', medium: 'both', actions: [{ method: 'play' }, { backend: 'ended' }], expect: ['beforePlay', 'play', 'playing', 'ended', 'item', 'play'] }],
    };
    expect(validateScenarioFile(doc).ok).toBe(true);
  });

  it('rejects an action that has neither method nor backend', () => {
    const doc = { contractVersion: '2.0.0', scenarios: [{ id: 'x', name: 'x', medium: 'both', actions: [{ args: [1] }], expect: [] }] };
    expect(validateScenarioFile(doc).ok).toBe(false);
  });

  it('rejects a scenario missing its expect list', () => {
    const doc = { contractVersion: '2.0.0', scenarios: [{ id: 'x', name: 'x', medium: 'both', actions: [{ method: 'play' }] }] };
    expect(validateScenarioFile(doc).ok).toBe(false);
  });
});

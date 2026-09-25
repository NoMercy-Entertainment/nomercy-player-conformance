// -----------------------------------------------------------------------------
//  Copyright (c) NoMercy Entertainment
//
//  Licensed under the Apache License, Version 2.0. See LICENSE for details.
//
//  SPDX-License-Identifier: Apache-2.0
// -----------------------------------------------------------------------------

import { describe, expect, it } from 'vitest';

import { ScenarioBackend } from '../scenario-backend';

describe('ScenarioBackend', () => {
  it('emits play then playing on play()', () => {
    const backend = new ScenarioBackend();
    const seen: string[] = [];
    backend.on((name: string) => seen.push(name));
    backend.play();
    expect(seen).toStrictEqual(['play', 'playing']);
  });

  it('scripts an ended event on demand', () => {
    const backend = new ScenarioBackend();
    const seen: string[] = [];
    backend.on((name: string) => seen.push(name));
    backend.script('ended', []);
    expect(seen).toStrictEqual(['ended']);
  });
});

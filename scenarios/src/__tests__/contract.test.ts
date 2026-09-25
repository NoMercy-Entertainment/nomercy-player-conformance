// -----------------------------------------------------------------------------
//  Copyright (c) NoMercy Entertainment
//
//  Licensed under the Apache License, Version 2.0. See LICENSE for details.
//
//  SPDX-License-Identifier: Apache-2.0
// -----------------------------------------------------------------------------

import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { MONOREPO_CONTRACT_PATH, VENDORED_CONTRACT_PATH } from '../paths';
import { contractEventNames } from '../runner';

describe('the vendored contract', () => {
  it('exists, so this repo runs standalone', () => {
    expect(existsSync(VENDORED_CONTRACT_PATH)).toBe(true);
  });

  it('matches the generator inside the monorepo', () => {
    if (!existsSync(MONOREPO_CONTRACT_PATH)) {
      // Standalone clone: there is nothing to compare against, and the
      // vendored copy is the only source. Skipping quietly here is safe
      // because the monorepo run is the one that can catch a stale copy.
      expect(existsSync(VENDORED_CONTRACT_PATH)).toBe(true);
      return;
    }

    const vendored = readFileSync(VENDORED_CONTRACT_PATH, 'utf8');
    const generated = readFileSync(MONOREPO_CONTRACT_PATH, 'utf8');

    expect(vendored).toBe(generated);
  });

  it('carries the whole surface, not a truncated copy', () => {
    const names = contractEventNames();

    expect(names.size).toBeGreaterThan(150);
    expect(names.has('beforePlay')).toBe(true);
    expect(names.has('stream:error')).toBe(true);
  });
});

// -----------------------------------------------------------------------------
//  Copyright (c) NoMercy Entertainment
//
//  Licensed under the Apache License, Version 2.0. See LICENSE for details.
//
//  SPDX-License-Identifier: Apache-2.0
// -----------------------------------------------------------------------------

import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { CONTRACT_PATH } from '../paths';
import { contractEventNames } from '../runner';

describe('the contract', () => {
  it('is the conformance generator output next door', () => {
    expect(existsSync(CONTRACT_PATH)).toBe(true);
  });

  it('carries the whole surface, not a truncated copy', () => {
    const names = contractEventNames();

    expect(names.size).toBeGreaterThan(150);
    expect(names.has('beforePlay')).toBe(true);
    expect(names.has('stream:error')).toBe(true);
  });
});

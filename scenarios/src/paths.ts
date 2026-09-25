// -----------------------------------------------------------------------------
//  Copyright (c) NoMercy Entertainment
//
//  Licensed under the Apache License, Version 2.0. See LICENSE for details.
//
//  SPDX-License-Identifier: Apache-2.0
// -----------------------------------------------------------------------------

import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here: string = dirname(fileURLToPath(import.meta.url));

export const REPO_ROOT: string = resolve(here, '..', '..', '..');

/** The generator's own output, present only inside the monorepo checkout. */
export const MONOREPO_CONTRACT_PATH: string = resolve(
  REPO_ROOT,
  'testing',
  'nomercy-player-conformance',
  'contract',
  'contract.json',
);

/**
 * A copy that travels with this repository.
 *
 * This repo is cloned on its own in CI and by anyone writing scenarios, where
 * the generator's output does not exist. Vendoring the contract is what lets
 * the harness run standalone; `npm run sync:contract` refreshes it, and
 * `contract.test.ts` fails when the two disagree inside the monorepo, so the
 * copy cannot quietly go stale.
 */
export const VENDORED_CONTRACT_PATH: string = resolve(here, '..', 'contract', 'contract.json');

/** Prefer the generator's live output; fall back to the vendored copy. */
export const CONTRACT_PATH: string = existsSync(MONOREPO_CONTRACT_PATH)
  ? MONOREPO_CONTRACT_PATH
  : VENDORED_CONTRACT_PATH;

export const SCENARIOS_PATH: string = resolve(here, '..', 'scenarios', 'scenarios.json');

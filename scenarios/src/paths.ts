// -----------------------------------------------------------------------------
//  Copyright (c) NoMercy Entertainment
//
//  Licensed under the Apache License, Version 2.0. See LICENSE for details.
//
//  SPDX-License-Identifier: Apache-2.0
// -----------------------------------------------------------------------------

import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here: string = dirname(fileURLToPath(import.meta.url));

/**
 * The generator's output. The harness lives inside the conformance repo, next
 * to the contract it runs against, so there is one copy and it cannot go stale.
 */
export const CONTRACT_PATH: string = resolve(here, '..', '..', 'contract', 'contract.json');

export const SCENARIOS_PATH: string = resolve(here, '..', 'scenarios', 'scenarios.json');

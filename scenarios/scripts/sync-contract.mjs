// -----------------------------------------------------------------------------
//  Copyright (c) NoMercy Entertainment
//
//  Licensed under the Apache License, Version 2.0. See LICENSE for details.
//
//  SPDX-License-Identifier: Apache-2.0
// -----------------------------------------------------------------------------

// Refresh the vendored contract from the generator. Only works inside the
// monorepo, which is the only place the generator's output exists.

import { copyFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..', '..', '..');
const generated = resolve(repoRoot, 'testing', 'nomercy-player-conformance', 'contract', 'contract.json');
const vendored = resolve(here, '..', 'contract', 'contract.json');

if (!existsSync(generated)) {
  console.error(`no generated contract at ${generated} — run this inside the monorepo`);
  process.exit(1);
}

copyFileSync(generated, vendored);
console.log(`synced ${vendored}`);

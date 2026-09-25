// -----------------------------------------------------------------------------
//  Copyright (c) NoMercy Entertainment
//
//  Licensed under the Apache License, Version 2.0. See LICENSE for details.
//
//  SPDX-License-Identifier: Apache-2.0
// -----------------------------------------------------------------------------

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Ajv } from 'ajv';

export interface Action {
  method?: string;
  args?: unknown[];
  preventVia?: string;
  backend?: string;
}

export interface Scenario {
  id: string;
  name: string;
  medium: 'both' | 'video' | 'music';
  playlist?: Record<string, unknown>[];
  config?: Record<string, unknown>;
  actions: Action[];
  expect: string[];
}

export interface ScenarioFile {
  contractVersion: string;
  scenarios: Scenario[];
}

// `new URL(relative, import.meta.url)` throws under Vitest's SSR transform —
// `import.meta.url` there is not a well-formed `file:` URL. Resolve via the
// filesystem path instead, mirroring `paths.ts`.
const here: string = dirname(fileURLToPath(import.meta.url));
const schema: object = JSON.parse(readFileSync(resolve(here, '..', 'scenarios', 'scenario.schema.json'), 'utf8'));
const validate = new Ajv({ allErrors: true }).compile(schema);

export function validateScenarioFile(json: unknown): { ok: boolean; errors: string[] } {
  const ok: boolean = validate(json) as boolean;
  const errors: string[] = (validate.errors ?? []).map(e => `${e.instancePath} ${e.message ?? ''}`.trim());
  return { ok, errors };
}

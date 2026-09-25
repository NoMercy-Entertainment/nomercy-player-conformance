// -----------------------------------------------------------------------------
//  Copyright (c) NoMercy Entertainment
//
//  Licensed under the Apache License, Version 2.0. See LICENSE for details.
//
//  SPDX-License-Identifier: Apache-2.0
// -----------------------------------------------------------------------------

import antfu from '@antfu/eslint-config';

export default antfu({
  ignores: [
    'dist/**',
    'scenarios/**',
    // Linting `eslint.config.js` itself triggers a full config-cache rebuild
    // on save — run `npx eslint eslint.config.js` manually when editing this file.
    'eslint.config.js',
  ],
  typescript: {
    overrides: {
      'no-async-promise-executor': 'off',
      'ts/method-signature-style': 'off',
      'unused-imports/no-unused-vars': 'error',
    },
  },
  test: {
    overrides: {
      'test/prefer-lowercase-title': 'off',
    },
  },
  stylistic: {
    indent: 2,
    quotes: 'single',
    semi: true,
  },
});

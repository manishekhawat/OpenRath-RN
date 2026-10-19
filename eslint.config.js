/**
 * Lint rules for the port. The code was already written as if a linter were watching: the
 * `eslint-disable-next-line react-hooks/exhaustive-deps` comments and the `no-explicit-any` ones on
 * the parsers that read outside responses only mean something with this file in place.
 *
 * `react-hooks/exhaustive-deps` is an error, because a stale dependency list in a screen that runs
 * for hours in a car is the bug class that hurts here. `any` is a warning: the JSON parsers keep
 * their suppressions. The import order is the one the repo already follows, and `src/map/mapHtml.ts`
 * is generated as one 290 KB line, so it is left out.
 *
 * The React Compiler rules that eslint-config-expo now turns on (purity, refs, set-state-in-effect,
 * immutability, globals) are warnings rather than errors. They flag the shape this port is built
 * on: the drive engine, the player and the settings live in module-level stores outside React and
 * are published through `useSyncExternalStore`, which is what lets the trip computer keep counting
 * while no screen is mounted. Making them errors would mean moving that state into React, which is
 * a redesign rather than a fix, so they are left visible as the backlog they are.
 */
const expo = require('eslint-config-expo/flat');

module.exports = [
  ...expo,
  {
    ignores: ['src/map/mapHtml.ts', 'dist/*', 'node_modules/*', '.expo/*', '.shots/*'],
  },
  {
    rules: {
      'react-hooks/exhaustive-deps': 'error',
      'react-hooks/purity': 'warn',
      'react-hooks/refs': 'warn',
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/immutability': 'warn',
      'react-hooks/globals': 'warn',
      '@typescript-eslint/no-explicit-any': 'warn',
      'import/order': [
        'warn',
        {
          // the order the repo already follows: packages, then `../logic`, then the folder's own files
          groups: ['builtin', 'external', 'internal', 'parent', 'sibling', 'index'],
          'newlines-between': 'ignore',
          alphabetize: { order: 'asc', caseInsensitive: true },
        },
      ],
    },
  },
];

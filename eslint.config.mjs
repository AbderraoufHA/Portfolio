import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import astro from 'eslint-plugin-astro';
import jsxA11y from 'eslint-plugin-jsx-a11y';

// eslint-plugin-astro's flat presets bundle eslint-plugin-prettier integration.
// Formatting is Prettier's job here (npm run format:check), so drop those entries
// instead of installing a second formatter pipeline inside ESLint.
const withoutPrettier = (configs) => configs.filter((config) => !config.rules?.['prettier/prettier']);

export default tseslint.config(
  {
    ignores: [
      'dist/**',
      '.astro/**',
      'node_modules/**',
      'public/**',
      'coverage/**',
      'playwright-report/**',
      'test-results/**',
    ],
  },

  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...withoutPrettier(astro.configs['flat/recommended']),
  ...withoutPrettier(astro.configs['flat/jsx-a11y-recommended']),

  {
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
    rules: {
      'no-console': ['warn', { allow: ['warn', 'error', 'info'] }],
      'no-undef': 'off', // TypeScript resolves identifiers, including type-only globals.
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
      eqeqeq: ['error', 'always', { null: 'ignore' }],
      'prefer-const': 'error',
    },
  },

  {
    // Astro templates intentionally render trusted, build-time HTML (theme boot script,
    // JSON-LD, sanitized markdown). The rule cannot tell trusted from untrusted input.
    files: ['**/*.astro'],
    rules: {
      'astro/no-set-html-directive': 'off',
    },
  },

  {
    files: ['**/*.tsx'],
    languageOptions: {
      globals: { ...globals.browser },
    },
    rules: {
      ...jsxA11y.flatConfigs.recommended.rules,
      'jsx-a11y/no-autofocus': 'off', // the command palette and modals focus deliberately on open
    },
  },

  {
    files: ['tests/**/*.ts', 'e2e/**/*.ts', 'scripts/**/*'],
    languageOptions: { globals: { ...globals.node } },
    rules: { 'no-console': 'off' },
  },
);

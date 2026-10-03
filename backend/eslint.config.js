// ESLint flat config. "strictTypeChecked" uses the TypeScript type information, so it catches
// things like un-awaited promises and unsafe use of `any`, not just style issues.
import { defineConfig } from 'eslint/config';
import tseslint from 'typescript-eslint';

export default defineConfig(
  { ignores: ['dist/', 'node_modules/'] },
  tseslint.configs.strictTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // Numbers in template strings (`$${params.length}`) are safe and very common in our SQL builders.
      '@typescript-eslint/restrict-template-expressions': ['error', { allowNumber: true }],
      // Express recognises an error handler by its 4 parameters, so an unused "_next" must stay.
      // ignoreRestSiblings allows `const { password_hash: _removed, ...user } = row` to drop a field.
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', ignoreRestSiblings: true }],
    },
  },
  {
    files: ['tests/**/*.ts'],
    rules: {
      // node:test's describe()/test() return promises that the runner itself awaits.
      '@typescript-eslint/no-floating-promises': ['error', {
        allowForKnownSafeCalls: [{ from: 'package', package: 'node:test', name: ['describe', 'test', 'before', 'after'] }],
      }],
      // Tests read untyped JSON responses and check every value with assertions.
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
    },
  },
  // This config file is plain JavaScript and not part of the TypeScript project.
  { files: ['eslint.config.js'], extends: [tseslint.configs.disableTypeChecked] },
);

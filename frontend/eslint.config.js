// ESLint flat config: type-aware TypeScript rules + the React hooks rules
// (hooks only at the top level, complete effect dependency lists).
import { defineConfig } from 'eslint/config';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';

export default defineConfig(
  { ignores: ['dist/', 'node_modules/'] },
  tseslint.configs.strictTypeChecked,
  reactHooks.configs.flat['recommended-latest'],
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/restrict-template-expressions': ['error', { allowNumber: true }],
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', ignoreRestSiblings: true }],
    },
  },
  // This config file is plain JavaScript and not part of the TypeScript project.
  { files: ['eslint.config.js'], extends: [tseslint.configs.disableTypeChecked] },
);

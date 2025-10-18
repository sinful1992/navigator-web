import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { globalIgnores } from 'eslint/config'

export default tseslint.config([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs['recommended-latest'],
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    rules: {
      // Prevent console usage - use logger instead
      'no-console': ['error', {
        allow: [] // No console methods allowed (use logger.* instead)
      }],
    },
  },
  // Allow console in test files and logger.ts itself
  {
    files: ['**/*.test.{ts,tsx}', '**/setupTests.ts', '**/logger.ts', '**/scripts/**'],
    rules: {
      'no-console': 'off',
    },
  },
])

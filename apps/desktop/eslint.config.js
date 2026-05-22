// Minimal ESLint flat config. Tightened as the codebase matures.

export default [
  {
    ignores: ['dist/**', 'src-tauri/target/**', 'src-tauri/gen/**', 'node_modules/**'],
  },
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        window: 'readonly',
        document: 'readonly',
        localStorage: 'readonly',
        console: 'readonly',
      },
    },
    rules: {
      // TypeScript handles unused/undefined identifiers. ESLint is here for
      // style + bug patterns we'll add layer by layer.
      'no-unused-vars': 'off',
      'no-undef': 'off',
    },
  },
];

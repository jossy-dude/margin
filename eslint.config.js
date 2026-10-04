const expo = require('eslint-config-expo/flat');
/* react-hooks/immutability and /refs are React-Compiler rules that flag every Reanimated `sharedValue.value = x` write; those writes are the library's API. */
module.exports = [
  ...expo,
  { ignores: ['node_modules', 'dist', '.expo', 'scripts/*.mjs'] },
  { rules: { 'react-hooks/immutability': 'off', 'react-hooks/refs': 'off', 'react-hooks/exhaustive-deps': 'warn', '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }] } },
];

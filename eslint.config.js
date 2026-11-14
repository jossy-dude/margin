const expo = require('eslint-config-expo/flat');
/* react-hooks/immutability and /refs are React-Compiler rules that flag every Reanimated `sharedValue.value = x` write; those writes are the library's API. */
module.exports = [
  ...expo,
  { ignores: ['node_modules', 'dist', '.expo', 'scripts/*.mjs'] },
  /* Metro bundles `.ogg` too (metro.config.js adds it for the v0.7 sounds), so require() of one is an asset import. */
  { files: ['**/*.ts', '**/*.tsx'], rules: { '@typescript-eslint/no-require-imports': ['warn', { allow: ['\\.(aac|aiff|avif|bmp|caf|db|gif|heic|html|jpeg|jpg|json|m4a|m4v|mov|mp3|mp4|mpeg|mpg|ogg|otf|pdf|png|psd|svg|ttf|wav|webm|webp|xml|yaml|yml|zip)$'] }] } },
  { rules: { 'react-hooks/immutability': 'off', 'react-hooks/refs': 'off', 'react-hooks/exhaustive-deps': 'warn', '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }] } },
];

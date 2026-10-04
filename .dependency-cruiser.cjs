/** The data boundary: UI/store never touch expo-sqlite; only data/sqlite does. domain is pure. */
module.exports = {
  forbidden: [
    { name: 'sqlite-only-in-adapter', severity: 'error', comment: 'expo-sqlite may only be imported by src/data/sqlite*', from: { pathNot: '^src/data/sqlite' }, to: { path: 'expo-sqlite' } },
    { name: 'domain-is-pure', severity: 'error', comment: 'src/domain must not import react-native, expo-* or UI/services/store/data', from: { path: '^src/domain' }, to: { path: ['react-native', '^node_modules/expo', '^src/(ui|screens|services|store|data|navigation)'] } },
    { name: 'ui-not-data', severity: 'error', comment: 'components talk to the store, never to a repository adapter', from: { path: '^src/(ui|screens|navigation)' }, to: { path: '^src/data/(sqlite|memory)' } },
  ],
  options: { tsConfig: { fileName: 'tsconfig.json' }, doNotFollow: { path: 'node_modules' } },
};

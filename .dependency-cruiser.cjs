/** The data boundary: UI/store never touch expo-sqlite; only data/sqlite does. domain is pure. */
module.exports = {
  forbidden: [
    { name: 'sqlite-only-in-adapter', severity: 'error', comment: 'expo-sqlite may only be imported by src/data/sqlite*', from: { pathNot: '^src/data/sqlite' }, to: { path: 'expo-sqlite' } },
    { name: 'domain-is-pure', severity: 'error', comment: 'src/domain must not import react-native, expo-* or UI/services/store/data', from: { path: '^src/domain' }, to: { path: ['react-native', '^node_modules/expo', '^src/(ui|screens|services|store|data|navigation)'] } },
    { name: 'ui-not-data', severity: 'error', comment: 'components (sheets included) talk to the store, never to a repository adapter', from: { path: '^src/(ui|screens|sheets|navigation)' }, to: { path: '^src/data/(sqlite|memory)' } },
    { name: 'data-not-up', severity: 'error', comment: 'src/data is the bottom layer: what it needs from above (the Problems log, the safety copy) is handed in as a port by store/openRepository.ts', from: { path: '^src/data' }, to: { path: '^src/(ui|screens|sheets|navigation|services|store)' } },
    { name: 'services-not-ui', severity: 'error', comment: 'services sit below the UI and the store: no component, page, sheet or store import', from: { path: '^src/services' }, to: { path: '^src/(ui|screens|sheets|navigation|store)' } },
  ],
  options: { tsConfig: { fileName: 'tsconfig.json' }, doNotFollow: { path: 'node_modules' } },
};

// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    // These rules are written for the React Compiler, which the app does not use. The game loop keeps its
    // state in refs and redraws every frame on purpose, so they would flag the design rather than bugs.
    rules: {
      'react-hooks/refs': 'off',
      'react-hooks/purity': 'off',
      'react-hooks/immutability': 'off',
      'react-hooks/set-state-in-effect': 'off',
    },
  },
  {
    ignores: ['dist/*', 'extras/*', 'src/game/three/models/*', 'src/game/three/heroRigged.ts', 'src/game/three/taxiMesh.ts'],
  },
]);

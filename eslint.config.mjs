import { defineConfig } from 'eslint/config';
import expoConfig from 'eslint-config-expo/flat.js';
import prettier from 'eslint-config-prettier';

export default defineConfig([
  { ignores: ['.npm-cache/**', '.expo/**', 'coverage/**', 'source-repo/*/bundle.js'] },
  expoConfig,
  prettier,
  {
    files: ['app/**/*.tsx', 'ui/**/*.tsx'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          // On device, the NativeWind JSX interop drops a Pressable's style callback: the
          // element renders with no background or size (seen on ActionButton, genre cards).
          selector:
            "JSXOpeningElement[name.name='Pressable'] > JSXAttribute[name.name='style'] > JSXExpressionContainer > ArrowFunctionExpression",
          message:
            'Static style only on Pressable: NativeWind drops style callbacks on device (see ActionButton).',
        },
      ],
    },
  },
]);

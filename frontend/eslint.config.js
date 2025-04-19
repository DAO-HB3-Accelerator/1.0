import globals from 'globals';
import vuePlugin from 'eslint-plugin-vue';
import prettierPlugin from 'eslint-plugin-prettier';
import prettierConfig from '@vue/eslint-config-prettier';

export default [
  {
    ignores: ['node_modules/**', 'dist/**', 'public/**'],
  },
  {
    files: ['**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        ...globals.browser,
        ...globals.es2021,
        process: 'readonly',
        __dirname: 'readonly',
      },
    },
    rules: {
      'no-unused-vars': 'off',
      'no-console': 'off',
      'no-undef': 'error',
      'no-duplicate-imports': 'error',
    },
  },
  {
    files: ['**/*.vue'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        ...globals.browser,
        ...globals.es2021,
      },
      parser: vuePlugin.parser,
      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
      },
    },
    plugins: {
      vue: vuePlugin,
      prettier: prettierPlugin,
    },
    processor: vuePlugin.processors['.vue'],
    rules: {
      ...prettierConfig.rules,
      'vue/multi-word-component-names': 'off',
      'vue/no-unused-vars': 'warn',
      'vue/html-self-closing': ['warn', {
        html: {
          void: 'always',
          normal: 'always',
          component: 'always'
        }
      }],
      'vue/component-name-in-template-casing': ['warn', 'PascalCase'],
    },
  },
];

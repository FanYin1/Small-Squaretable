import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import pluginVue from 'eslint-plugin-vue';

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  // essential = 只拦会出错的写法（不含格式类规则），P4-5 接入 .vue
  ...pluginVue.configs['flat/essential'],
  {
    ignores: ['dist/', 'node_modules/', '*.js'],
  },
  {
    files: ['**/*.vue'],
    languageOptions: {
      parserOptions: {
        parser: tseslint.parser,
        extraFileExtensions: ['.vue'],
      },
    },
    rules: {
      // 同 typescript-eslint 对 .ts 的处理：未定义名由 vue-tsc 检查（含模板），这里只会误报浏览器全局
      'no-undef': 'off',
      // 单词组件名只与 HTML 元素冲突时有害；Toast 不撞任何元素
      'vue/multi-word-component-names': ['error', { ignores: ['Toast'] }],
    },
  },
  {
    // 路由页面只经 router 加载，不会作为模板标签出现
    files: ['src/client/pages/**/*.vue'],
    rules: {
      'vue/multi-word-component-names': 'off',
    },
  },
  {
    rules: {
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'warn',
    },
  },
  {
    files: ['**/*.spec.ts', '**/*.test.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
    },
  }
);

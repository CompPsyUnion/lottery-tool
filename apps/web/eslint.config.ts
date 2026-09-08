import vue from 'eslint-plugin-vue'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  {
    ignores: [
      'dist/**',
      'node_modules/**',
      '*.d.ts',
      'src/components/ui/**/*', // shadcn-vue 生成组件
    ],
  },
  ...tseslint.configs.recommended.map((c) => ({
    ...c,
    files: ['**/*.{ts,vue}'],
    languageOptions: {
      ...c.languageOptions,
      // 显式声明 tsconfig 根：IDE 从 monorepo 根运行时会推断出
      // service/web 两个候选而报错（CLI 各包目录内运行不受影响）
      parserOptions: {
        ...c.languageOptions?.parserOptions,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  })),
  ...vue.configs['flat/recommended'].map((c) => ({
    ...c,
    files: ['**/*.vue'],
  })),
  {
    files: ['**/*.vue'],
    languageOptions: {
      parserOptions: {
        parser: tseslint.parser,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    rules: {
      // 与项目既有风格/历史代码兼容，避免存量海量报错；新代码仍受核心规则约束
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      // 核心质量规则为 error（阻断提交）
      'no-debugger': 'error',
      'no-var': 'error',
      'prefer-const': 'error',
      eqeqeq: ['error', 'smart'],
      'no-throw-literal': 'error',
      'vue/multi-word-component-names': 'off',
      'vue/max-attributes-per-line': 'off',
      'vue/singleline-html-element-content-newline': 'off',
      'vue/html-self-closing': 'off',
      'vue/html-indent': 'off',
      'vue/html-attribute-value': 'off',
    },
  },
)

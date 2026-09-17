import parser from '@typescript-eslint/parser';
import hooks from 'eslint-plugin-react-hooks';
import a11y from 'eslint-plugin-jsx-a11y';

export default [
  { ignores: ['**/node_modules/**', '**/.next/**', '**/dist/**'] },
  {
    files: ['frontend/**/*.{ts,tsx}'],
    languageOptions: { parser, parserOptions: { ecmaVersion: 'latest', sourceType: 'module', ecmaFeatures: { jsx: true } } },
    plugins: { 'react-hooks': hooks, 'jsx-a11y': a11y },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'jsx-a11y/alt-text': 'error',
      'jsx-a11y/aria-props': 'error',
      'jsx-a11y/aria-proptypes': 'error',
      'jsx-a11y/aria-role': 'error',
      'jsx-a11y/anchor-has-content': 'error',
      'jsx-a11y/heading-has-content': 'error',
      'jsx-a11y/no-autofocus': 'off',
      'no-debugger': 'error',
      'no-duplicate-imports': 'error',
      'no-unreachable': 'error',
    },
  },
];

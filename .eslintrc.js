module.exports = {
  parser: '@typescript-eslint/parser',
  parserOptions: {
    project: './tsconfig.json',  // Ensure this points to your tsconfig.json
    tsconfigRootDir: __dirname, // Helps ESLint resolve the project
  },
  extends: [
    'plugin:@typescript-eslint/recommended',
  ],
  rules: {
    '@typescript-eslint/no-floating-promises': 'error'
  }
};

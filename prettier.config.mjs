/** @type {import('prettier').Config} */
export default {
  printWidth: 120,
  singleQuote: true,
  semi: true,
  trailingComma: 'all',
  arrowParens: 'always',
  bracketSpacing: true,
  endOfLine: 'lf',
  plugins: ['prettier-plugin-astro'],
  overrides: [
    {
      files: '*.astro',
      options: { parser: 'astro' },
    },
    {
      files: ['*.json', '*.webmanifest'],
      options: { printWidth: 100 },
    },
    {
      files: ['*.md'],
      options: { proseWrap: 'preserve' },
    },
  ],
};

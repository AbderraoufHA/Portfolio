/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{astro,html,ts,tsx,md}'],
  darkMode: ['class', '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        bg: 'rgb(var(--bg-rgb) / <alpha-value>)',
        surface: 'rgb(var(--surface-rgb) / <alpha-value>)',
        elevated: 'rgb(var(--elevated-rgb) / <alpha-value>)',
        line: 'rgb(var(--line-rgb) / <alpha-value>)',
        ink: 'rgb(var(--ink-rgb) / <alpha-value>)',
        muted: 'rgb(var(--muted-rgb) / <alpha-value>)',
        accent: 'rgb(var(--accent-rgb) / <alpha-value>)',
        accentink: 'rgb(var(--accent-ink-rgb) / <alpha-value>)',
      },
      fontFamily: {
        sans: ['InterVariable', 'Inter', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
        mono: ['JetBrainsMono', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      maxWidth: {
        shell: '72rem',
      },
      boxShadow: {
        glow: '0 0 0 1px rgb(var(--accent-rgb) / 0.25), 0 18px 60px -20px rgb(var(--accent-rgb) / 0.35)',
        lift: '0 24px 60px -30px rgb(0 0 0 / 0.55)',
      },
      keyframes: {
        blink: { '0%, 49%': { opacity: '1' }, '50%, 100%': { opacity: '0' } },
        rise: { from: { opacity: '0', transform: 'translateY(12px)' }, to: { opacity: '1', transform: 'none' } },
        pulseDot: {
          '0%, 100%': { opacity: '1', boxShadow: '0 0 0 0 rgb(var(--accent-rgb) / 0.5)' },
          '50%': { opacity: '.85', boxShadow: '0 0 0 6px rgb(var(--accent-rgb) / 0)' },
        },
      },
      animation: {
        blink: 'blink 1.1s steps(1, end) infinite',
        rise: 'rise .5s cubic-bezier(.2,.7,.3,1) both',
        pulseDot: 'pulseDot 2.4s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};

/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/renderer/**/*.{html,ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        bg: {
          DEFAULT: 'rgb(var(--color-bg-default) / <alpha-value>)',
          soft: 'rgb(var(--color-bg-soft) / <alpha-value>)',
          elevated: 'rgb(var(--color-bg-elevated) / <alpha-value>)',
          hover: 'rgb(var(--color-bg-hover) / <alpha-value>)',
          deep: 'rgb(var(--color-bg-deep) / <alpha-value>)',
        },
        border: {
          DEFAULT: 'rgb(var(--color-border-default) / <alpha-value>)',
          soft: 'rgb(var(--color-border-soft) / <alpha-value>)',
        },
        fg: {
          DEFAULT: 'rgb(var(--color-fg-default) / <alpha-value>)',
          muted: 'rgb(var(--color-fg-muted) / <alpha-value>)',
          subtle: 'rgb(var(--color-fg-subtle) / <alpha-value>)',
        },
        accent: {
          DEFAULT: 'rgb(var(--color-accent-default) / <alpha-value>)',
          muted: 'rgb(var(--color-accent-muted) / <alpha-value>)',
          fg: 'rgb(var(--color-accent-fg) / <alpha-value>)',
          /** Brighter accent for tab lines / highlights (see `--color-accent-electric`). */
          electric: 'rgb(var(--color-accent-electric) / <alpha-value>)',
        },
        cyan: 'rgb(var(--color-cyan) / <alpha-value>)',
        violet: 'rgb(var(--color-violet) / <alpha-value>)',
        success: 'rgb(var(--color-success) / <alpha-value>)',
        warn: 'rgb(var(--color-warn) / <alpha-value>)',
        danger: 'rgb(var(--color-danger) / <alpha-value>)',
      },
      ringColor: {
        subtle: 'var(--ring-subtle)',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
        mono: ['JetBrains Mono', 'Menlo', 'Consolas', 'monospace'],
      },
      boxShadow: {
        chrome: 'var(--shadow-chrome)',
        float: 'var(--shadow-float)',
        card: 'var(--shadow-card)',
        'card-hover': 'var(--shadow-card-hover)',
      },
      transitionDuration: {
        layout: '180ms',
      },
    },
  },
  plugins: [],
};

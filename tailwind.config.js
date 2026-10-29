/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        base: 'rgb(var(--color-base) / <alpha-value>)',
        panel: 'rgb(var(--color-panel) / <alpha-value>)',
        surface: 'rgb(var(--color-surface) / <alpha-value>)',
        elevated: 'rgb(var(--color-elevated) / <alpha-value>)',
        line: 'rgb(var(--color-line) / <alpha-value>)',
        'line-strong': 'rgb(var(--color-line-strong) / <alpha-value>)',
        'row-hover': 'rgb(var(--color-row-hover) / <alpha-value>)',
        tint: 'rgb(var(--color-tint) / <alpha-value>)',
        scrim: 'rgb(var(--color-scrim))',
        'on-accent': 'rgb(var(--color-on-accent) / <alpha-value>)',
        accent: {
          DEFAULT: 'rgb(var(--color-accent) / <alpha-value>)',
          hover: 'rgb(var(--color-accent-hover) / <alpha-value>)',
          soft: 'rgb(var(--color-accent-soft) / <alpha-value>)',
        },
        text: {
          DEFAULT: 'rgb(var(--color-text) / <alpha-value>)',
          strong: 'rgb(var(--color-text-strong) / <alpha-value>)',
          soft: 'rgb(var(--color-text-soft) / <alpha-value>)',
          muted: 'rgb(var(--color-text-muted) / <alpha-value>)',
          faint: 'rgb(var(--color-text-faint) / <alpha-value>)',
        },
        success: 'rgb(var(--color-success) / <alpha-value>)',
        warning: 'rgb(var(--color-warning) / <alpha-value>)',
        danger: 'rgb(var(--color-danger) / <alpha-value>)',
        info: 'rgb(var(--color-info) / <alpha-value>)',
      },
      fontFamily: {
        sans: ['var(--app-font-family)'],
        mono: [
          'JetBrains Mono',
          'ui-monospace',
          'SFMono-Regular',
          'Menlo',
          'Consolas',
          'DejaVu Sans Mono',
          'Noto Sans Mono',
          'monospace',
        ],
      },
      keyframes: {
        fadeIn: {
          from: { opacity: '0', transform: 'translateY(4px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        indeterminate: {
          '0%': { transform: 'translateX(-40%)', width: '40%' },
          '100%': { transform: 'translateX(220%)', width: '60%' },
        },
      },
      animation: {
        'fade-in': 'fadeIn 140ms ease-out',
        indeterminate: 'indeterminate 1.1s ease-in-out infinite',
      },
    },
  },
  plugins: [],
}

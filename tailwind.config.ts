import type { Config } from 'tailwindcss';

export default {
  content: ['./app/**/*.{ts,tsx}', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        matrix: '#00FF41',
        cyber: '#00D4FF',
        term: {
          bg: '#05070a',
          panel: '#0b0f14',
          line: '#1b2733',
          dim: '#7c8a99',
          text: '#cfe9d8',
        },
      },
      fontFamily: {
        mono: ['var(--font-mono)', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      boxShadow: {
        neon: '0 0 8px rgba(0,255,65,0.35)',
        cyber: '0 0 8px rgba(0,212,255,0.35)',
      },
    },
  },
  plugins: [],
} satisfies Config;

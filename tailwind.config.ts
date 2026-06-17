import type { Config } from 'tailwindcss';

export default {
  content: ['./app/**/*.{ts,tsx}', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        matrix: '#00FF41',
        cyber: '#00D4FF',
        violet: '#8B5CFF',
        magenta: '#FF4ECd',
        // Retained terminal ramp (now used as a cool neutral scale on glass).
        term: {
          bg: '#05070a',
          panel: '#0b0f14',
          line: '#1b2733',
          dim: '#8aa0b4',
          text: '#e6f1ff',
        },
      },
      fontFamily: {
        mono: ['var(--font-mono)', 'ui-monospace', 'SFMono-Regular', 'monospace'],
        sans: ['var(--font-sans)', 'system-ui', 'Segoe UI', 'sans-serif'],
      },
      boxShadow: {
        neon: '0 0 12px rgba(0,255,65,0.45)',
        cyber: '0 0 12px rgba(0,212,255,0.45)',
        violet: '0 0 12px rgba(139,92,255,0.45)',
        glass: '0 8px 32px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.06)',
      },
      backdropBlur: {
        xs: '2px',
      },
      keyframes: {
        aurora: {
          '0%,100%': { transform: 'translate3d(0,0,0) scale(1)' },
          '33%': { transform: 'translate3d(6%,-4%,0) scale(1.15)' },
          '66%': { transform: 'translate3d(-5%,5%,0) scale(0.92)' },
        },
        float: {
          '0%,100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-6px)' },
        },
        ring: {
          '0%': { boxShadow: '0 0 0 0 rgba(0,255,65,0.5)' },
          '100%': { boxShadow: '0 0 0 10px rgba(0,255,65,0)' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        bob: {
          '0%,100%': { transform: 'translateZ(14px) rotateX(-17deg) translateY(0)' },
          '50%': { transform: 'translateZ(14px) rotateX(-17deg) translateY(-3px)' },
        },
        landpop: {
          '0%': { transform: 'scale(0.6)' },
          '60%': { transform: 'scale(1.18)' },
          '100%': { transform: 'scale(1)' },
        },
      },
      animation: {
        aurora: 'aurora 18s ease-in-out infinite',
        float: 'float 4s ease-in-out infinite',
        ring: 'ring 1.6s ease-out infinite',
        shimmer: 'shimmer 2.5s linear infinite',
        bob: 'bob 2.2s ease-in-out infinite',
        landpop: 'landpop 0.35s ease-out',
      },
    },
  },
  plugins: [],
} satisfies Config;

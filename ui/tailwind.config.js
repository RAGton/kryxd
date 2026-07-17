export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        'kryonix-dark': '#0f172a',
        'kryonix-blue': '#3b82f6',
        'kve-bg': '#05070a',
        'kve-panel': 'rgba(10, 11, 20, 0.85)',
        'kve-border': 'rgba(56, 189, 248, 0.08)',
        'kve-accent': '#38bdf8',
        'kve-accent-muted': 'rgba(56, 189, 248, 0.1)',
        'kve-success': '#0ea5e9',
        'kve-warning': '#f59e0b',
        'kve-danger': '#ef4444',
        'kve-indigo': '#1d4ed8',
        'bg': 'var(--kx-bg)',
        'bg-elevated': 'var(--kx-surface)',
        'bg-surface': 'var(--kx-surface-elevated)',
        'bg-glass': 'var(--kx-surface)',
        'bg-light': 'var(--kx-bg)',
        'bg-light-glass': 'var(--kx-surface)',
        'border-subtle': 'var(--kx-border)',
        'border-active': 'var(--kx-primary)',
        'text-primary': 'var(--kx-text)',
        'text-secondary': 'var(--kx-text-secondary)',
        'text-muted': 'var(--kx-muted)',
        'accent-blue': 'var(--kx-primary)',
        'accent-cyan': 'var(--kx-primary)',
        'success': 'var(--kx-success)',
        'warning': 'var(--kx-warning)',
        'danger': 'var(--kx-danger)',
      },
      spacing: {
        'shell': '2rem',
        'panel': '1.5rem',
        'card': '1rem',
        'section': '2.5rem',
      },
      boxShadow: {
        'glass': '0 4px 30px rgba(0, 0, 0, 0.5)',
        'panel': '0 10px 25px -5px rgba(0, 0, 0, 0.3)',
        'danger': '0 4px 20px -2px rgba(239, 68, 68, 0.3)',
        'focus': '0 0 0 2px rgba(59, 130, 246, 0.5)',
      },
      fontFamily: {
        mono: ['"JetBrains Mono"', '"Fira Code"', 'monospace'],
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      keyframes: {
        'fade-in': {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'fade-in-up': {
          '0%': { opacity: '0', transform: 'translateY(16px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'pulse-slow': {
          '0%, 100%': { opacity: '0.3' },
          '50%': { opacity: '0.6' },
        },
        'pulse-soft': {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.7' },
        }
      },
      animation: {
        'fade-in': 'fade-in 0.6s cubic-bezier(0.16, 1, 0.3, 1) forwards',
        'fade-in-up': 'fade-in-up 0.7s cubic-bezier(0.16, 1, 0.3, 1) forwards',
        'pulse-slow': 'pulse-slow 8s ease-in-out infinite',
        'pulse-soft': 'pulse-soft 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
      }
    },
  },
  plugins: [],
};

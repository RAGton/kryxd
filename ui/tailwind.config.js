export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        'kryonix-dark': '#0f172a',
        'kryonix-blue': '#3b82f6',
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
        }
      },
      animation: {
        'fade-in': 'fade-in 0.6s cubic-bezier(0.16, 1, 0.3, 1) forwards',
        'fade-in-up': 'fade-in-up 0.7s cubic-bezier(0.16, 1, 0.3, 1) forwards',
      }
    },
  },
  plugins: [],
};

import type { Config } from 'tailwindcss'

export default {
  content: ['./src/**/*.{vue,ts,js}'],
  theme: {
    extend: {
      colors: {
        ozon: {
          50: '#e6f0ff',
          100: '#b3d1ff',
          200: '#80b3ff',
          300: '#4d94ff',
          400: '#1a75ff',
          500: '#005bff',
          600: '#004de6',
          700: '#003fb3',
          800: '#003399',
          900: '#001a4d',
        },
        wb: {
          50: '#fce4f6',
          100: '#f5b3e3',
          200: '#ee82d0',
          300: '#e751bd',
          400: '#e02fb0',
          500: '#cb11ab',
          600: '#a60e89',
          700: '#800b6a',
          800: '#5a084b',
          900: '#34052c',
        },
        brand: {
          50: '#fff5eb',
          100: '#ffe0c2',
          200: '#ffc799',
          300: '#ffad70',
          400: '#ff9347',
          500: '#ff6600',
          600: '#e65c00',
          700: '#cc5200',
          800: '#b34700',
          900: '#803300',
        },
        surface: {
          0: '#ffffff',
          50: '#f8f9fc',
          100: '#f1f3f8',
          200: '#e4e7f0',
          300: '#d1d5e0',
          400: '#9ba3b5',
          500: '#6b7280',
          600: '#4b5563',
          700: '#374151',
          800: '#1f2937',
          900: '#111827',
          950: '#0a0f1a',
        },
      },
      boxShadow: {
        'glass': '0 8px 32px rgba(0, 0, 0, 0.08)',
        'glass-lg': '0 16px 48px rgba(0, 0, 0, 0.12)',
        'card': '0 1px 3px rgba(0, 0, 0, 0.06), 0 4px 12px rgba(0, 0, 0, 0.04)',
        'card-hover': '0 4px 12px rgba(0, 0, 0, 0.1), 0 8px 24px rgba(0, 0, 0, 0.06)',
        'glow-ozon': '0 0 20px rgba(0, 91, 255, 0.3)',
        'glow-wb': '0 0 20px rgba(203, 17, 171, 0.3)',
        'glow-brand': '0 0 20px rgba(255, 102, 0, 0.3)',
      },
      borderRadius: {
        '2xl': '1rem',
        '3xl': '1.5rem',
      },
      animation: {
        'fade-in': 'fadeIn 0.3s ease-out',
        'slide-up': 'slideUp 0.3s ease-out',
        'slide-down': 'slideDown 0.3s ease-out',
        'scale-in': 'scaleIn 0.2s ease-out',
        'pulse-soft': 'pulseSoft 2s ease-in-out infinite',
        'shimmer': 'shimmer 2s linear infinite',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        slideDown: {
          '0%': { opacity: '0', transform: 'translateY(-8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        scaleIn: {
          '0%': { opacity: '0', transform: 'scale(0.95)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
        pulseSoft: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.7' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
      },
    },
  },
  plugins: [],
} satisfies Config

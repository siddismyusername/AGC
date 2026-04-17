import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './lib/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        bg: 'hsl(var(--bg))',
        surface: 'hsl(var(--surface))',
        line: 'hsl(var(--line))',
        text: 'hsl(var(--text))',
        muted: 'hsl(var(--muted))',
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        success: 'hsl(var(--success))',
        warning: 'hsl(var(--warning))',
        danger: 'hsl(var(--danger))',
      },
      boxShadow: {
        halo: '0 20px 60px rgba(0, 0, 0, 0.28)',
      },
      backgroundImage: {
        'mesh-gradient':
          'radial-gradient(circle at top left, rgba(243, 159, 37, 0.18), transparent 34%), radial-gradient(circle at top right, rgba(20, 184, 166, 0.14), transparent 28%), linear-gradient(180deg, rgba(11, 18, 32, 0.96), rgba(5, 8, 16, 1))',
      },
    },
  },
  plugins: [],
};

export default config;
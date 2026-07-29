/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}"
  ],
  theme: {
    extend: {
      colors: {
        // Surfaces
        bg:          'var(--bg)',
        surface:     { DEFAULT: 'var(--surface)', 2: 'var(--surface-2)' },
        bd:          'var(--border)',
        // Text (use as text-primary, text-secondary, text-muted, text-accent)
        primary:     'var(--text-primary)',
        secondary:   'var(--text-secondary)',
        muted:       'var(--text-muted)',
        // Brand
        accent:      { DEFAULT: 'var(--accent)', light: 'var(--accent-light)', glow: 'var(--accent-glow)' },
        // Navy
        navy:        { DEFAULT: 'var(--navy)', mid: 'var(--navy-mid)', deep: 'var(--navy-deep)', light: 'var(--navy-light)' },
      },
      boxShadow: {
        xs:       'var(--shadow-xs)',
        card:     'var(--shadow-sm)',
        elevated: 'var(--shadow-md)',
      },
      fontFamily: {
        sans:    ['Inter', 'system-ui', 'sans-serif'],
        arabic:  ['IBM Plex Sans Arabic', 'system-ui', 'sans-serif'],
      },
      fontSize: {
        '2xs':  ['10px',   { lineHeight: '1.4' }],
        '2.5':  ['10.5px', { lineHeight: '1.4' }],
        '3':    ['11px',   { lineHeight: '1.4' }],
        '3.5':  ['11.5px', { lineHeight: '1.4' }],
        '3.75': ['12.5px', { lineHeight: '1.4' }],
        '3.25': ['13px',   { lineHeight: '1.5' }],
        '3.4':  ['13.5px', { lineHeight: '1.5' }],
        '3.6':  ['15px',   { lineHeight: '1.5' }],
        '4.5':  ['17px',   { lineHeight: '1.5' }],
        '5.5':  ['22px',   { lineHeight: '1.3' }],
        '6.5':  ['26px',   { lineHeight: '1.2' }],
      },
      spacing: {
        '4.5':  '18px',
        '5.5':  '22px',
        '6.5':  '26px',
        '7.5':  '30px',
        '8.5':  '34px',
        '9.5':  '38px',
        '10.5': '42px',
        '13':   '52px',
        '15':   '60px',
        '18':   '72px',
        '22':   '88px',
        '35':   '140px',
      },
    },
  },
  plugins: [],
}

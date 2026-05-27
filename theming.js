/**
 * dj-theming.js — Unified themeing API for DJ GNOME Extensions.
 *
 * This file defines the 'dj-twilight-shadowpunk' theme and provides
 * helpers for applying colors, fonts, and spacing across the extension suite.
 */

// ─── Theme Definition ────────────────────────────────────────────────

export const THEME = {
    name: 'dj-twilight-shadowpunk',
    colors: {
        bg:      '#0f172a', // slate-900
        panel:   '#1e293b', // slate-800
        fg:      '#f8fafc', // slate-50
        dim:     '#94a3b8', // slate-400
        ok:      '#4ade80', // green-400
        warn:    '#facc15', // yellow-400
        bad:     '#f87171', // red-400
        accent:  '#c4b5fd', // violet-300
        sky:     '#7dd3fc', // sky-300
        violet:  '#c4b5fd', // violet-300
        gold:    '#fbbf24', // amber-400
        shadow:  'rgba(0, 0, 0, 0.5)',
    },
    fonts: {
        sans:    'Inter, Cantarell, Sans-Serif',
        mono:    'JetBrains Mono, Fira Code, Monospace',
        size_xs: '10px',
        size_sm: '12px',
        size_md: '14px',
        size_lg: '16px',
    },
    spacing: {
        xs:      '2px',
        sm:      '4px',
        md:      '8px',
        lg:      '12px',
        xl:      '16px',
    },
    glows: {
        ok:      '0 0 8px rgba(74, 222, 128, 0.4)',
        accent:  '0 0 8px rgba(196, 181, 253, 0.4)',
        bad:     '0 0 8px rgba(248, 113, 113, 0.4)',
    }
};

/**
 * Returns the effective theme by merging profile overrides.
 */
export function getTheme(profileTheme = {}) {
    return {
        ...THEME,
        ...profileTheme,
        colors:  { ...THEME.colors,  ...(profileTheme.colors  || {}) },
        fonts:   { ...THEME.fonts,   ...(profileTheme.fonts   || {}) },
        spacing: { ...THEME.spacing, ...(profileTheme.spacing || {}) },
        glows:   { ...THEME.glows,   ...(profileTheme.glows   || {}) },
    };
}

// ─── Styling Helpers (Pango Markup) ──────────────────────────────────

/** Wrap text in a PangoMarkup span with `color`. */
export function mark(text, color) {
    return `<span color="${color}">${text}</span>`;
}

/** Bold via Pango. */
export function bold(text) {
    return `<b>${text}</b>`;
}

/** Render in DIM color. */
export function dim(text, color = THEME.colors.dim) {
    return mark(text, color);
}

/** Bold + colored. */
export function strong(text, color) {
    return `<span color="${color}" weight="bold">${text}</span>`;
}

/** Italic. */
export function italic(text) {
    return `<i>${text}</i>`;
}

/** Underline. */
export function underline(text) {
    return `<u>${text}</u>`;
}

/** Escape Pango-meaningful chars. */
export function esc(text) {
    return String(text)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

// ─── CSS Generation ──────────────────────────────────────────────────

/**
 * Returns a CSS style string for a widget based on theme keys.
 * Example: css({ bg: 'panel', fg: 'accent', padding: 'md' })
 */
export function css(props) {
    const rules = [];
    if (props.bg) rules.push(`background-color: ${THEME.colors[props.bg] || props.bg};`);
    if (props.fg) rules.push(`color: ${THEME.colors[props.fg] || props.fg};`);
    if (props.padding) rules.push(`padding: ${THEME.spacing[props.padding] || props.padding};`);
    if (props.margin) rules.push(`margin: ${THEME.spacing[props.margin] || props.margin};`);
    if (props.font) rules.push(`font-family: ${THEME.fonts[props.font] || props.font};`);
    if (props.size) rules.push(`font-size: ${THEME.fonts['size_' + props.size] || props.size};`);
    if (props.radius) rules.push(`border-radius: ${THEME.spacing[props.radius] || props.radius};`);
    if (props.glow) rules.push(`box-shadow: ${THEME.glows[props.glow] || props.glow};`);
    
    return rules.join(' ');
}

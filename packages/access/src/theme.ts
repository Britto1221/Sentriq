import { useMemo } from "react";

export const DESIGN_TOKENS = Object.freeze({
  spacing: Object.freeze({ 0: "0", 1: "0.25rem", 2: "0.5rem", 3: "0.75rem", 4: "1rem", 5: "1.5rem", 6: "2rem", 7: "3rem" }),
  typography: Object.freeze({
    family: Object.freeze({ body: '"Segoe UI", system-ui, -apple-system, BlinkMacSystemFont, sans-serif', mono: '"Cascadia Code", Consolas, "Liberation Mono", monospace' }),
    size: Object.freeze({ xs: "0.75rem", sm: "0.875rem", base: "1rem", lg: "1.25rem", xl: "1.75rem", display: "clamp(2rem, 4vw, 3rem)" }),
    weight: Object.freeze({ regular: 400, medium: 560, semibold: 650, bold: 740 }),
    lineHeight: Object.freeze({ tight: 1.16, body: 1.55, relaxed: 1.75 }),
    letterSpacing: Object.freeze({ tight: "-0.025em", normal: "0", wide: "0.035em" }),
  }),
  border: Object.freeze({ width: "2px", style: "solid" }),
  radius: Object.freeze({ none: "0", xs: "0", sm: "2px", md: "4px" }),
  shadow: Object.freeze({ small: "3px 3px 0 var(--access-outline)", hard: "4px 4px 0 var(--access-outline)" }),
  motion: Object.freeze({ fast: "120ms", normal: "180ms", easing: "cubic-bezier(0.2, 0.8, 0.2, 1)" }),
  focus: Object.freeze({ width: "3px", offset: "3px" }),
  breakpoints: Object.freeze({ mobile: "620px", tablet: "780px", compactDesktop: "1050px", wide: "1280px" }),
});

export const SENTRIQ_ACCESS_THEME = Object.freeze({
  id: "sentriq",
  palette: Object.freeze({
    canvas: "#171B16",
    shell: "#20261F",
    surface: "#F0F1E6",
    raised: "#DCE5D0",
    ink: "#151912",
    muted: "#3E493A",
    outline: "#050705",
    signal: "#CCFF52",
    secondary: "#8BA55B",
    success: "#247343",
    warning: "#755700",
    danger: "#A5313C",
    focus: "#CCFF52",
  }),
  tokens: DESIGN_TOKENS,
});

/** Northstar semantic colors map to the existing blue/teal product palette. */
export const NORTHSTAR_ACCESS_THEME = Object.freeze({
  id: "northstar",
  palette: Object.freeze({
    canvas: "#F3F6F8",
    shell: "#FFFFFF",
    surface: "#FFFFFF",
    raised: "#EEF4F7",
    ink: "#142531",
    muted: "#526673",
    outline: "#DCE5EA",
    signal: "#2D6488",
    secondary: "#3D7B75",
    success: "#1F5C50",
    warning: "#755700",
    danger: "#B83232",
    focus: "#075B83",
  }),
  tokens: DESIGN_TOKENS,
});

export function useSentriqTheme() {
  return useMemo(() => SENTRIQ_ACCESS_THEME, []);
}

export function useNorthstarTheme() {
  return useMemo(() => NORTHSTAR_ACCESS_THEME, []);
}

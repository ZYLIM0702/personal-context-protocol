import type { ThemeProps } from "@openuidev/react-ui";

const PRIMARY = "#6a3df0";
const HOVER = "#5a2fd8";
const PRESSED = "#4b25bd";
const TINT = "#f4f0ff";
const INK = "#151a2d";
const MUTED = "#6b6b80";
const LINE = "#e8e5f0";
const PAGE = "#f8f7fc";
const FONT = '-apple-system, BlinkMacSystemFont, "Inter", "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';
const PALETTE = ["#6a3df0", "#a78bfa", "#7c5cff", "#c4b5fd", "#4b25bd", "#ddd6fe"];

export const theme: NonNullable<ThemeProps["lightTheme"]> = {
  background: PAGE,
  foreground: "#ffffff",
  popoverBackground: "#ffffff",
  sunkLight: "rgba(106, 61, 240, 0.03)",
  sunk: "rgba(106, 61, 240, 0.05)",
  sunkDeep: "rgba(106, 61, 240, 0.09)",
  elevatedLight: "rgba(21, 26, 45, 0.03)",
  elevated: "rgba(21, 26, 45, 0.06)",
  highlightSubtle: "rgba(106, 61, 240, 0.03)",
  highlight: "rgba(106, 61, 240, 0.06)",
  highlightStrong: "rgba(106, 61, 240, 0.1)",
  infoBackground: TINT,
  purpleBackground: TINT,
  textNeutralPrimary: INK,
  textNeutralSecondary: MUTED,
  textNeutralTertiary: "rgba(21, 26, 45, 0.32)",
  textNeutralLink: PRIMARY,
  textBrand: PRIMARY,
  textAccentPrimary: "#ffffff",
  textInfoPrimary: HOVER,
  textPurplePrimary: HOVER,
  interactiveAccentDefault: PRIMARY,
  interactiveAccentHover: HOVER,
  interactiveAccentPressed: PRESSED,
  interactiveAccentDisabled: "rgba(106, 61, 240, 0.35)",
  borderDefault: LINE,
  borderInteractive: LINE,
  borderInteractiveEmphasis: "#cfc6ea",
  borderInteractiveSelected: PRIMARY,
  borderAccent: "rgba(106, 61, 240, 0.14)",
  borderAccentEmphasis: "rgba(106, 61, 240, 0.4)",
  borderAccentSelected: PRIMARY,
  borderInfo: "rgba(106, 61, 240, 0.14)",
  borderInfoEmphasis: PRIMARY,
  invertedBackground: PRIMARY,
  chatUserResponseBg: TINT,
  chatUserResponseText: INK,
  defaultChartPalette: PALETTE,
  barChartPalette: PALETTE,
  lineChartPalette: PALETTE,
  areaChartPalette: PALETTE,
  pieChartPalette: PALETTE,
  radarChartPalette: PALETTE,
  radialChartPalette: PALETTE,
  horizontalBarChartPalette: PALETTE,
  fontBody: FONT,
  fontHeading: FONT,
  fontLabel: FONT,
  fontNumbers: FONT,
};

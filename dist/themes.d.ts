//#region lib/core.d.ts
/**
 * Styles for a Zed syntax scope. The `& {}` unions preserve literal
 * suggestions and accept `string` and `number` types from bundled themes.
 */
interface ThemeSyntaxSettings {
  /** Text color, or a variable suffix for a named CSS palette. */
  color?: string;
  /** `italic` enables italic text. Other values use normal text. */
  font_style?: 'italic' | 'normal' | (string & {});
  /** Font weight from 100 to 900, rounded to the nearest hundred. */
  font_weight?: 100 | 200 | 300 | 400 | 500 | 600 | 700 | 800 | 900 | (number & {});
}
/** Colors for one collaborator slot in a Zed theme's `players` array. */
interface ThemePlayer {
  /** Cursor color for this collaborator. */
  cursor?: string;
  /** Selection color for this collaborator. */
  selection?: string;
  /** Background color for this collaborator. */
  background?: string;
}
/** Colors and syntax scopes from a Zed-compatible theme. */
interface ThemeStyle {
  /** Background color when `editor.background` is absent. */
  background?: string;
  /** Text color when both `editor.foreground` and `text` are absent. */
  foreground?: string;
  /** Text color when `editor.foreground` is absent. Takes precedence over `foreground`. */
  text?: string;
  /** Editor background color. Takes precedence over `background`. */
  'editor.background'?: string;
  /** Editor text color. Takes precedence over `text` and `foreground`. */
  'editor.foreground'?: string;
  /** Background color for the active editor line. */
  'editor.active_line.background'?: string;
  /** Background color for a highlighted bracket. */
  'editor.document_highlight.bracket_background'?: string;
  /** Background color for a search match. */
  'search.match_background'?: string;
  /** Colors for each collaborator. */
  players?: readonly ThemePlayer[];
  /** Color for error diagnostics. */
  error?: string;
  /** Color for warning diagnostics. */
  warning?: string;
  /** Color for information diagnostics. */
  info?: string;
  /** Color for hint diagnostics. */
  hint?: string;
  /** Syntax scope names mapped to text colors or font and color settings. */
  syntax?: Record<string, string | ThemeSyntaxSettings>;
  /** Additional Zed theme properties, such as `terminal.ansi.red`. */
  [key: string]: unknown;
}
/** A Zed-compatible color theme. */
interface Theme {
  id?: string;
  /** Display name of the theme. */
  name: string;
  /** Light or dark appearance. Accepts other names from bundled themes. */
  appearance: 'dark' | 'light' | (string & {});
  /** Editor colors and syntax styles. */
  style: ThemeStyle;
  /**
   * `true` uses CSS variables for each token type and ignores `style`.
   * A palette object treats colors in `style` as variable suffixes and retains font styles.
   */
  cssVariables?: true | {
    /** Prefix for palette variables. Defaults to `--hls-`. */
    prefix?: string;
    /** Fallback CSS values keyed by variable suffix, without the prefix. */
    defaults?: Record<string, string>;
  };
}
/**
 * A Shiki-compatible styled run within one line. Offsets use UTF-16 code
 * units. `codeToTokens` and streams use input offsets. `getLineTokens`
 * uses line offsets.
 */
interface ThemedToken {
  /** Token text without line breaks. In `ansi` mode, escape sequences are absent. */
  content: string;
  /** Start offset in UTF-16 code units, relative to the input or line. */
  offset: number;
  /** A theme color, or a prefixed `var(...)` for CSS-variable themes. */
  color?: string;
  /** Background color. Highlights emits it only for `ansi`. */
  bgColor?: string;
  /**
   * Shiki flags: italic 1, bold 2, underline 4, strikethrough 8.
   * Markdown can combine italic and bold or use strikethrough.
   */
  fontStyle?: number;
  /**
   * Styles for multiple themes. The `defaultColor` theme uses `color`,
   * `font-style`, and `font-weight`. Other themes use custom properties
   * with the prefix `${cssVariablePrefix}${themeColor}`.
   * Equal runs share this map. Replace it to change one token's styles.
   */
  htmlStyle?: Record<string, string>;
  /** Extra attributes for the token's `<span>` (`htmlAttrs` in Shiki). */
  htmlAttrs?: Record<string, string>;
  /** Standard token type: 0 or omitted for other; 1 comment; 2 string; 3 regex. */
  type?: number;
}
//#endregion
//#region lib/theme.d.ts
type FontProperty = 'font-style' | 'font-weight' | 'text-decoration';
//#endregion
//#region themes/index.d.ts
/** A pass-through theme: every color resolves to a prefixed CSS variable. */
declare const cssVariables: Theme;
/**
 * Convert a Zed theme to CSS custom properties.
 * Emit only hex and numeric Display P3 colors. Omit invalid background
 * and foreground colors. Use `inherit` for invalid syntax colors.
 * Skip syntax scopes whose names are not plain dotted identifiers.
 * The 16 `terminal-ansi-*` colors use VS Code's terminal colors when missing.
 */
declare function toCSS({ style }: Theme, { cssVariablePrefix, fontStyle }?: {
  cssVariablePrefix?: string;
  fontStyle?: boolean;
}): string;
/** Return a font or decoration variable for a token from the `cssVariables` theme. */
declare function getFontStyle(token: ThemedToken, property?: FontProperty): string | undefined;
declare const andromeeda: Theme;
declare const auroraX: Theme;
declare const ayuDark: Theme;
declare const ayuLight: Theme;
declare const ayuMirage: Theme;
declare const catppuccinFrappe: Theme;
declare const catppuccinLatte: Theme;
declare const catppuccinMacchiato: Theme;
declare const catppuccinMocha: Theme;
declare const darkPlus: Theme;
declare const dracula: Theme;
declare const draculaSoft: Theme;
declare const everforestDark: Theme;
declare const everforestLight: Theme;
declare const githubDark: Theme;
declare const githubDarkDefault: Theme;
declare const githubDarkDimmed: Theme;
declare const githubDarkHighContrast: Theme;
declare const githubLight: Theme;
declare const githubLightDefault: Theme;
declare const githubLightHighContrast: Theme;
declare const gruvboxDarkHard: Theme;
declare const gruvboxDarkMedium: Theme;
declare const gruvboxDarkSoft: Theme;
declare const gruvboxLightHard: Theme;
declare const gruvboxLightMedium: Theme;
declare const gruvboxLightSoft: Theme;
declare const horizon: Theme;
declare const horizonBright: Theme;
declare const houston: Theme;
declare const kanagawaDragon: Theme;
declare const kanagawaLotus: Theme;
declare const kanagawaWave: Theme;
declare const laserwave: Theme;
declare const lightPlus: Theme;
declare const materialTheme: Theme;
declare const materialThemeDarker: Theme;
declare const materialThemeLighter: Theme;
declare const materialThemeOcean: Theme;
declare const materialThemePalenight: Theme;
declare const minDark: Theme;
declare const minLight: Theme;
declare const monokai: Theme;
declare const nightOwl: Theme;
declare const nightOwlLight: Theme;
declare const nord: Theme;
declare const oneDarkPro: Theme;
declare const oneLight: Theme;
declare const plastic: Theme;
declare const poimandres: Theme;
declare const red: Theme;
declare const rosePine: Theme;
declare const rosePineDawn: Theme;
declare const rosePineMoon: Theme;
declare const slackDark: Theme;
declare const slackOchin: Theme;
declare const snazzyLight: Theme;
declare const solarizedDark: Theme;
declare const solarizedLight: Theme;
declare const synthwave84: Theme;
declare const tokyoNight: Theme;
declare const vesper: Theme;
declare const vitesseBlack: Theme;
declare const vitesseDark: Theme;
declare const vitesseLight: Theme;
declare const pierreDark: Theme;
declare const pierreDarkProtanopiaDeuteranopia: Theme;
declare const pierreDarkSoft: Theme;
declare const pierreDarkTritanopia: Theme;
declare const pierreDarkVibrant: Theme;
declare const pierreLight: Theme;
declare const pierreLightProtanopiaDeuteranopia: Theme;
declare const pierreLightSoft: Theme;
declare const pierreLightTritanopia: Theme;
declare const pierreLightVibrant: Theme;
declare const themes: readonly Theme[];
//#endregion
export { andromeeda, auroraX, ayuDark, ayuLight, ayuMirage, catppuccinFrappe, catppuccinLatte, catppuccinMacchiato, catppuccinMocha, cssVariables, darkPlus, dracula, draculaSoft, everforestDark, everforestLight, getFontStyle, githubDark, githubDarkDefault, githubDarkDimmed, githubDarkHighContrast, githubLight, githubLightDefault, githubLightHighContrast, gruvboxDarkHard, gruvboxDarkMedium, gruvboxDarkSoft, gruvboxLightHard, gruvboxLightMedium, gruvboxLightSoft, horizon, horizonBright, houston, kanagawaDragon, kanagawaLotus, kanagawaWave, laserwave, lightPlus, materialTheme, materialThemeDarker, materialThemeLighter, materialThemeOcean, materialThemePalenight, minDark, minLight, monokai, nightOwl, nightOwlLight, nord, oneDarkPro, oneLight, pierreDark, pierreDarkProtanopiaDeuteranopia, pierreDarkSoft, pierreDarkTritanopia, pierreDarkVibrant, pierreLight, pierreLightProtanopiaDeuteranopia, pierreLightSoft, pierreLightTritanopia, pierreLightVibrant, plastic, poimandres, red, rosePine, rosePineDawn, rosePineMoon, slackDark, slackOchin, snazzyLight, solarizedDark, solarizedLight, synthwave84, themes, toCSS, tokyoNight, vesper, vitesseBlack, vitesseDark, vitesseLight };
//# sourceMappingURL=themes.d.ts.map
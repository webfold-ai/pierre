import { DiffsTheme } from "../themes/types.js";
import { DiffsEditorTokenizerOptions, DiffsStreamTokenizer } from "../tokenizer-types.js";
import { DiffsEditorTokenizer } from "../DiffsEditorTokenizer.js";
import { ResolvedLanguage } from "../../worker/types.js";
import { DiffsHighlighter } from "../DiffsHighlighter.js";
import { CodeToTokensOptions, TokensResult } from "../types.js";
import "../../worker/index.js";
//#region src/highlighter/backends/highlights.d.ts
/**
 * Highlights uses bundled lexers and lexers registered with the `'highlights'`
 * type. Other languages render as text.
 */
declare class HighlightsHighlighter extends DiffsHighlighter {
  private readonly usedThemes;
  private readonly attachedLanguages;
  constructor();
  getTheme(name: string): DiffsTheme;
  codeToTokens(code: string, options: CodeToTokensOptions): TokensResult;
  createEditorTokenizer(options: DiffsEditorTokenizerOptions): DiffsEditorTokenizer;
  createStreamTokenizer(options: CodeToTokensOptions): DiffsStreamTokenizer;
  loadLanguages(languages: readonly string[]): Promise<void>;
  hasLoadedLanguages(languages: readonly string[]): boolean;
  attachLanguages(languages: readonly ResolvedLanguage[]): void;
  protected releaseResources(): void;
  private resolveOptions;
  private getZedTheme;
}
//#endregion
export { HighlightsHighlighter };
//# sourceMappingURL=highlights.d.ts.map
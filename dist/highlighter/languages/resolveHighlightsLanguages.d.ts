import { ResolvedLanguage } from "../../worker/types.js";
import "../../worker/index.js";
//#region src/highlighter/languages/resolveHighlightsLanguages.d.ts
/**
 * Load the Highlights lexers registered for these names. Names without one
 * use bundled lexers and are skipped. Return without a promise when every
 * lexer is already loaded.
 */
declare function resolveHighlightsLanguages(languages: readonly string[]): ResolvedLanguage[] | Promise<ResolvedLanguage[]>;
//#endregion
export { resolveHighlightsLanguages };
//# sourceMappingURL=resolveHighlightsLanguages.d.ts.map
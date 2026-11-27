import { ResolvedLanguage } from "../../worker/types.js";
import { SupportedLanguages } from "../../types.js";
import "../../worker/index.js";
import { DynamicImportLanguageRegistration } from "shiki";
import { Language } from "@pierre/highlights";
//#region src/highlighter/languages/constants.d.ts
declare const ResolvedLanguages: Map<SupportedLanguages, ResolvedLanguage>;
declare const ResolvingLanguages: Map<SupportedLanguages, Promise<ResolvedLanguage>>;
declare const RegisteredCustomLanguages: Map<string, DynamicImportLanguageRegistration>;
declare const RegisteredHighlightsLanguages: Map<string, () => Promise<{
  default: Language;
}>>;
declare const ResolvedHighlightsLanguages: Map<string, ResolvedLanguage>;
declare const AttachedLanguages: Set<string>;
//#endregion
export { AttachedLanguages, RegisteredCustomLanguages, RegisteredHighlightsLanguages, ResolvedHighlightsLanguages, ResolvedLanguages, ResolvingLanguages };
//# sourceMappingURL=constants.d.ts.map
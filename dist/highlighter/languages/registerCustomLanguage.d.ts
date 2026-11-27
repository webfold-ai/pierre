import { DynamicImportLanguageRegistration } from "shiki";
import { Language } from "@pierre/highlights";
//#region src/highlighter/languages/registerCustomLanguage.d.ts
/**
 * Register a custom language loader and optionally map it to
 * file names or extensions. The registered name must match a returned
 * grammar's name or aliases; registering a loader does not automatically add a
 * grammar alias. A `'highlights'` loader returns a Highlights lexer, such as
 * `@pierre/highlights/langs/*` or `@pierre/wat-tools` output.
 */
declare function registerCustomLanguage(lang: string, loader: () => Promise<{
  default: Language;
}>, extensionsOrFilenames: string[] | undefined, type: 'highlights'): void;
declare function registerCustomLanguage(lang: string, loader: DynamicImportLanguageRegistration, extensionsOrFilenames?: string[], type?: 'textmate'): void;
//#endregion
export { registerCustomLanguage };
//# sourceMappingURL=registerCustomLanguage.d.ts.map
import { RegisteredCustomLanguages, RegisteredHighlightsLanguages } from "./constants.js";
import { setCustomExtension } from "../../utils/getFiletypeFromFileName.js";
//#region src/highlighter/languages/registerCustomLanguage.ts
function registerCustomLanguage(lang, loader, extensionsOrFilenames = [], type = "textmate") {
	if (lang === "text" || lang === "ansi") throw new Error("registerCustomLanguage: 'text' and 'ansi' are reserved language names");
	const loaders = type === "highlights" ? RegisteredHighlightsLanguages : RegisteredCustomLanguages;
	if (loaders.has(lang)) {
		console.error(`registerCustomLanguage: lang: ${lang} is already registered`);
		return;
	}
	loaders.set(lang, loader);
	for (const extension of extensionsOrFilenames) setCustomExtension(extension, lang);
}
//#endregion
export { registerCustomLanguage };

//# sourceMappingURL=registerCustomLanguage.js.map
import { AttachedLanguages, ResolvedHighlightsLanguages, ResolvedLanguages } from "./constants.js";
//#region src/highlighter/languages/cleanUpResolvedLanguages.ts
function cleanUpResolvedLanguages() {
	ResolvedLanguages.clear();
	ResolvedHighlightsLanguages.clear();
	AttachedLanguages.clear();
}
//#endregion
export { cleanUpResolvedLanguages };

//# sourceMappingURL=cleanUpResolvedLanguages.js.map
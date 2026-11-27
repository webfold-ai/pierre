import { AttachedLanguages, ResolvedHighlightsLanguages, ResolvedLanguages } from "./constants.js";
//#region src/highlighter/languages/attachResolvedLanguages.ts
/**
* Record resolved grammars in the shared language cache and attach them to a
* highlighter. Highlights attaches only the lexers registered for it.
*/
function attachResolvedLanguages(resolvedLanguages, highlighter) {
	const languages = Array.isArray(resolvedLanguages) ? resolvedLanguages : [resolvedLanguages];
	if (languages.length > 1 && highlighter.name !== "highlights") {
		for (const language of languages) {
			const lang = cacheResolvedLanguage(language);
			highlighter.attachLanguages([lang]);
			AttachedLanguages.add(lang.name);
		}
		return;
	}
	const langs = languages.map(cacheResolvedLanguage);
	highlighter.attachLanguages(langs);
	for (const lang of langs) AttachedLanguages.add(lang.name);
}
function cacheResolvedLanguage(language) {
	const cache = language.highlights == null ? ResolvedLanguages : ResolvedHighlightsLanguages;
	const cached = cache.get(language.name);
	if (cached != null) return cached;
	cache.set(language.name, language);
	return language;
}
//#endregion
export { attachResolvedLanguages };

//# sourceMappingURL=attachResolvedLanguages.js.map
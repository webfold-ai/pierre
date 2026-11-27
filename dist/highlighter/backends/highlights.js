import { RegisteredHighlightsLanguages } from "../languages/constants.js";
import { createDiffsThemeResolver } from "../themes/themeResolver.js";
import { DiffsEditorTokenizer } from "../DiffsEditorTokenizer.js";
import { DiffsHighlighter } from "../DiffsHighlighter.js";
import { HighlightsEditorTokenizer } from "../highlights-editor.js";
import { HighlightsStreamTokenizer } from "../highlights-stream.js";
import { resolveHighlightsLanguages } from "../languages/resolveHighlightsLanguages.js";
import { codeToTokens, isSupportedLanguage, registerLanguages } from "@pierre/highlights";
//#region src/highlighter/backends/highlights.ts
/**
* Highlights uses bundled lexers and lexers registered with the `'highlights'`
* type. Other languages render as text.
*/
var HighlightsHighlighter = class extends DiffsHighlighter {
	usedThemes = /* @__PURE__ */ new Map();
	attachedLanguages = /* @__PURE__ */ new Set();
	constructor() {
		super("highlights", createDiffsThemeResolver("highlights"));
	}
	getTheme(name) {
		this.assertNotDisposed();
		const theme = this.themeResolver.getResolvedTheme(name) ?? this.usedThemes.get(name);
		if (theme == null) throw new Error(`Theme "${name}" has not been resolved`);
		this.usedThemes.set(name, theme);
		return theme;
	}
	codeToTokens(code, options) {
		this.assertNotDisposed();
		return codeToTokens(code, this.resolveOptions(options));
	}
	createEditorTokenizer(options) {
		this.assertNotDisposed();
		return new DiffsEditorTokenizer(new HighlightsEditorTokenizer(options, (tokenizerOptions) => this.resolveOptions(tokenizerOptions)), options);
	}
	createStreamTokenizer(options) {
		return new HighlightsStreamTokenizer(this.resolveOptions(options));
	}
	async loadLanguages(languages) {
		this.assertNotDisposed();
		this.attachLanguages(await resolveHighlightsLanguages(languages.filter((lang) => !this.attachedLanguages.has(lang))));
	}
	hasLoadedLanguages(languages) {
		return !this.disposed && languages.every((lang) => this.attachedLanguages.has(lang) || !RegisteredHighlightsLanguages.has(lang));
	}
	attachLanguages(languages) {
		this.assertNotDisposed();
		const names = [];
		const lexers = [];
		for (const { name, highlights } of languages) {
			if (highlights == null || this.attachedLanguages.has(name)) continue;
			const aliases = Object.keys(highlights.aliases).map((alias) => alias.toLowerCase());
			if (!aliases.includes(name.toLowerCase())) throw new Error(`HighlightsHighlighter.attachLanguages: The Highlights lexer "${highlights.name}" does not declare "${name}" as an alias.`);
			const plain = aliases.find((alias) => [
				"plain",
				"plaintext",
				"text",
				"txt"
			].includes(alias));
			if (plain !== void 0) throw new Error(`HighlightsHighlighter.attachLanguages: The Highlights lexer "${highlights.name}" declares the reserved alias "${plain}".`);
			names.push(name);
			lexers.push(highlights);
		}
		if (lexers.length === 0) return;
		registerLanguages(lexers);
		for (const name of names) this.attachedLanguages.add(name);
	}
	releaseResources() {
		this.usedThemes.clear();
		this.attachedLanguages.clear();
	}
	resolveOptions({ theme, themes, ...options }) {
		const lang = this.attachedLanguages.has(options.lang) || isSupportedLanguage(options.lang) ? options.lang : "text";
		if (theme != null) return {
			...options,
			lang,
			theme: this.getZedTheme(theme)
		};
		if (themes == null) throw new Error("A theme or themes option is required");
		const resolved = {};
		for (const [key, name] of Object.entries(themes)) resolved[key] = this.getZedTheme(name);
		return {
			...options,
			lang,
			themes: resolved
		};
	}
	getZedTheme(name) {
		const theme = this.getTheme(name);
		if (theme.zed == null) throw new Error(`Theme "${name}" does not support Highlights`);
		return theme.zed;
	}
};
//#endregion
export { HighlightsHighlighter };

//# sourceMappingURL=highlights.js.map
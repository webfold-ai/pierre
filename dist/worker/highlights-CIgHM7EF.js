import { d as ResolvedHighlightsLanguages, r as appendItems, u as RegisteredHighlightsLanguages } from "./renderTokenLines-BLZwGeIp.js";
import { n as formatCSSVariablePrefix } from "./workerHandlers-D0wv5Hl_.js";
import { n as DiffsHighlighter, o as createDiffsThemeResolver, r as DiffsEditorTokenizer, t as BaseStreamTokenizer } from "./stream-tokenizer-7LLwu37w.js";
import { LiveTokenizer, codeToTokens, isSupportedLanguage, registerLanguages } from "@pierre/highlights";
//#region src/highlighter/highlights-editor.ts
/**
* Colors an editable document with the highlights lexer, which keeps its
* own copy of the text and its own dirty lines: it is told the edits,
* colors from them, delivers every line it colors, and stops once a line's
* state matches what it was. This class keeps that copy in step with the
* document and returns what the lexer finishes during a call.
*/
var HighlightsEditorTokenizer = class {
	options;
	resolveOptions;
	#tokenizer;
	#version;
	#paused = false;
	#captured;
	#primed = false;
	constructor(options, resolveOptions) {
		this.options = options;
		this.resolveOptions = resolveOptions;
		this.#version = options.textDocument.version;
		this.#tokenizer = this.#createTokenizer();
	}
	#createTokenizer() {
		return new LiveTokenizer({
			...this.resolveOptions({
				lang: this.options.textDocument.languageId,
				theme: this.options.theme,
				cssVariablePrefix: formatCSSVariablePrefix("token"),
				tokenizeMaxLineLength: this.options.tokenizeMaxLineLength ?? 1e3
			}),
			code: this.options.textDocument.getText(),
			renderRange: [0, 0],
			onDeferTokenize: (lines) => this.#deliver(lines)
		});
	}
	#deliver(lines) {
		const captured = this.#captured;
		if (captured != null) {
			for (const [line, tokens] of lines) captured.set(line, tokens);
			return;
		}
		this.options.onDeferTokenize(lines);
	}
	/**
	* Gives the lexer an edit and returns every line it finishes with it, in
	* and above `window`: the edited lines, the lines below them until the
	* state matches again, and lines it had left for later.
	*/
	applyChange(change, window) {
		const document = this.options.textDocument;
		const start = Math.min(window?.[0] ?? 0, document.lineCount);
		const end = Math.min(window?.[1] ?? Infinity, document.lineCount);
		this.#paused = false;
		const lines = /* @__PURE__ */ new Map();
		const taken = this.#version === document.version && this.#tokenizer.lineCount === document.lineCount;
		const completed = /* @__PURE__ */ new Map();
		this.#captured = completed;
		try {
			if (!taken) {
				const update = this.#version !== document.version ? this.#syncDocument(change, [start, end]) : this.#tokenizer.reset(document.getText(), { renderRange: [start, end] });
				this.#version = document.version;
				for (const [line, tokens] of update.lines) lines.set(line, tokens);
			}
			this.#tokenizer.flush(end);
		} finally {
			this.#captured = void 0;
		}
		for (const [line, tokens] of completed) lines.set(line, tokens);
		if (taken) for (const [first, last] of change.changedLineRanges) {
			const from = Math.max(first, start);
			const to = Math.min(last + 1, end);
			for (let line = from; line < to; line++) if (!lines.has(line)) lines.set(line, this.#lineTokens(line).tokens);
		}
		return lines;
	}
	/** Finishes every line before `end` now and returns the ones it colored. */
	flush(end) {
		const document = this.options.textDocument;
		if (this.#version !== document.version || this.#tokenizer.lineCount !== document.lineCount) return /* @__PURE__ */ new Map();
		const lines = this.#flushTo(Math.min(end, document.lineCount));
		if (this.#paused) this.#tokenizer.pause();
		return lines;
	}
	/**
	* Lexes the attach window once so later edits compare against known
	* states and report only the lines they changed. With `domCurrent` the
	* rows already show these tokens, so nothing is delivered; otherwise the
	* lines are delivered as the background pass reaches them.
	*/
	prime(window, domCurrent) {
		const document = this.options.textDocument;
		if (!domCurrent || this.#primed || this.#version !== document.version || this.#tokenizer.lineCount !== document.lineCount) return;
		this.#primed = true;
		this.#flushTo(Math.min(window[1], document.lineCount));
		if (this.#paused) this.#tokenizer.pause();
	}
	/** The string, comment and regexp ranges of a line. */
	bracketIgnoredRanges(line) {
		return this.#lineTokens(line).bracketIgnoredRanges;
	}
	#lineTokens(line) {
		const document = this.options.textDocument;
		if (this.#version !== document.version || this.#tokenizer.lineCount !== document.lineCount) {
			this.#captured = /* @__PURE__ */ new Map();
			try {
				this.#tokenizer.reset(document.getText(), { renderRange: [line, line + 1] });
				this.#version = document.version;
			} finally {
				this.#captured = void 0;
				if (this.#paused) this.#tokenizer.pause();
			}
		}
		const { tokens, bracketIgnoredRanges } = this.#tokenizer.getLineTokens(line);
		return {
			tokens: tokens.length === 0 ? [[
				0,
				"",
				""
			]] : tokens.map((token) => [
				token.offset,
				token.color ?? "",
				token.content
			]),
			bracketIgnoredRanges
		};
	}
	setTheme(themeName) {
		if (themeName === this.options.theme) return;
		this.options.theme = themeName;
		this.#tokenizer.dispose();
		this.#paused = false;
		this.#version = this.options.textDocument.version;
		this.#tokenizer = this.#createTokenizer();
		this.#primed = true;
	}
	pause() {
		this.#paused = true;
		this.#tokenizer.pause();
	}
	resume() {
		this.#paused = false;
		this.#tokenizer.resume();
	}
	dispose() {
		this.#tokenizer.dispose();
	}
	#flushTo(end) {
		const completed = /* @__PURE__ */ new Map();
		this.#captured = completed;
		try {
			this.#tokenizer.flush(end);
		} finally {
			this.#captured = void 0;
		}
		return completed;
	}
	#syncDocument(change, renderRange) {
		const document = this.options.textDocument;
		const options = { renderRange };
		if (Math.abs(document.version - this.#version) === 1 && change.changes.length > 0 && this.#tokenizer.lineCount === change.previousLineCount) try {
			const update = this.#tokenizer.applyEdits(change.changes.map(({ range, text }) => ({
				range,
				newText: text
			})), options);
			if (this.#tokenizer.lineCount === document.lineCount) return update;
		} catch (error) {
			if (!(error instanceof RangeError)) throw error;
		}
		return this.#tokenizer.reset(document.getText(), options);
	}
};
//#endregion
//#region src/highlighter/highlights-stream.ts
const TRIM_LINE_COUNT = 1024;
const DOCUMENT_START = {
	line: 0,
	character: 0
};
/** Keeps the unfinished line editable so new chunks can recall provisional tokens. */
var HighlightsStreamTokenizer = class HighlightsStreamTokenizer extends BaseStreamTokenizer {
	options;
	#tokenizer;
	#trimLineCount = TRIM_LINE_COUNT;
	constructor(options) {
		super();
		this.options = options;
		this.#tokenizer = new LiveTokenizer(options);
	}
	tokenizeChunk(chunk, stable) {
		const lineBreaks = [...chunk.matchAll(/\r\n|\r|\n/g)];
		const startLine = this.#tokenizer.lineCount - 1;
		const position = {
			line: startLine,
			character: this.#tokenizer.getLineLength(startLine)
		};
		this.#tokenizer.applyEdits([{
			range: {
				start: position,
				end: position
			},
			newText: chunk
		}]);
		const lastLine = this.#tokenizer.lineCount - 1;
		let unstable = [];
		for (let line = startLine; line <= lastLine; line++) {
			const { tokens } = this.#tokenizer.getLineTokens(line);
			for (const token of tokens) token.offset += this.stableOffset;
			if (line < lastLine) {
				appendItems(stable, tokens);
				this.pushLineBreak(stable, this.#tokenizer.getLineLength(line), lineBreaks[line - startLine][0]);
			} else unstable = tokens;
		}
		const tailLength = this.#tokenizer.getLineLength(lastLine);
		if (lastLine > this.#trimLineCount) {
			const text = this.#tokenizer.getText();
			const { lineChanges } = this.#tokenizer.applyEdits([{
				range: {
					start: DOCUMENT_START,
					end: {
						line: lastLine - 1,
						character: 0
					}
				},
				newText: ""
			}]);
			if (lineChanges.every((change) => change.newEndLine <= 1)) this.#trimLineCount = TRIM_LINE_COUNT;
			else {
				const keptLength = this.#tokenizer.getText().length;
				this.#tokenizer.applyEdits([{
					range: {
						start: DOCUMENT_START,
						end: DOCUMENT_START
					},
					newText: text.slice(0, text.length - keptLength)
				}]);
				this.#trimLineCount = lastLine * 2;
			}
		}
		return {
			unstable,
			tailLength
		};
	}
	clone() {
		this.assertActive();
		const clone = new HighlightsStreamTokenizer(this.options);
		clone.#tokenizer.reset(this.#tokenizer.getText());
		this.copyStateTo(clone);
		return clone;
	}
	resetSource() {
		this.#tokenizer.reset("");
		this.#trimLineCount = TRIM_LINE_COUNT;
	}
	releaseSource() {
		this.#tokenizer.dispose();
	}
};
//#endregion
//#region src/highlighter/languages/resolveHighlightsLanguages.ts
/**
* Load the Highlights lexers registered for these names. Names without one
* use bundled lexers and are skipped. Return without a promise when every
* lexer is already loaded.
*/
function resolveHighlightsLanguages(languages) {
	const result = [];
	const pending = [];
	for (const name of languages) {
		const loader = RegisteredHighlightsLanguages.get(name);
		if (loader == null) continue;
		const resolved = ResolvedHighlightsLanguages.get(name);
		if (resolved != null) {
			result.push(resolved);
			continue;
		}
		const index = result.push({
			name,
			data: []
		}) - 1;
		pending.push(loader().then(({ default: highlights }) => {
			let lang = ResolvedHighlightsLanguages.get(name);
			if (lang == null) {
				lang = {
					name,
					data: [],
					highlights
				};
				ResolvedHighlightsLanguages.set(name, lang);
			}
			result[index] = lang;
		}));
	}
	return pending.length === 0 ? result : Promise.all(pending).then(() => result);
}
//#endregion
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

//# sourceMappingURL=highlights-CIgHM7EF.js.map
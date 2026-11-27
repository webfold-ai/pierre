import { f as ResolvedLanguages, l as RegisteredCustomLanguages, p as ResolvingLanguages, r as appendItems, u as RegisteredHighlightsLanguages } from "./renderTokenLines-BLZwGeIp.js";
import { r as attachResolvedLanguages } from "./workerHandlers-D0wv5Hl_.js";
import { a as moveLineEntries, i as lineChangesOf, n as DiffsHighlighter, o as createDiffsThemeResolver, r as DiffsEditorTokenizer, s as isWorkerContext, t as BaseStreamTokenizer } from "./stream-tokenizer-7LLwu37w.js";
import { createCssVariablesTheme, createHighlighterCore } from "shiki/core";
import { EncodedTokenMetadata, INITIAL } from "shiki/textmate";
//#region src/highlighter/languages/resolveLanguage.ts
async function resolveLanguage(lang) {
	if (typeof __DIFFS_WORKER__ !== "undefined" ? __DIFFS_WORKER__ : isWorkerContext()) throw new Error(`resolveLanguage("${lang}") cannot be called from a worker context. Languages must be pre-resolved on the main thread and passed to the worker via the resolvedLanguages parameter.`);
	const pending = ResolvingLanguages.get(lang);
	if (pending != null) return pending;
	const resolver = (async () => {
		let loader = RegisteredCustomLanguages.get(lang);
		if (loader == null) {
			const { bundledLanguages } = await import("shiki/langs");
			if (Object.prototype.hasOwnProperty.call(bundledLanguages, lang)) loader = bundledLanguages[lang];
		}
		if (loader == null && !RegisteredHighlightsLanguages.has(lang)) throw new Error(`resolveLanguage: "${lang}" not found in bundled or custom languages`);
		const resolvedLang = {
			name: lang,
			data: loader == null ? [{
				name: lang,
				scopeName: `text.${lang}`,
				patterns: [],
				repository: {}
			}] : (await loader()).default
		};
		if (!ResolvedLanguages.has(lang)) ResolvedLanguages.set(lang, resolvedLang);
		return resolvedLang;
	})();
	ResolvingLanguages.set(lang, resolver);
	try {
		return await resolver;
	} finally {
		if (ResolvingLanguages.get(lang) === resolver) ResolvingLanguages.delete(lang);
	}
}
//#endregion
//#region src/highlighter/languages/getResolvedOrResolveLanguage.ts
function getResolvedOrResolveLanguage(language) {
	return ResolvedLanguages.get(language) ?? resolveLanguage(language);
}
//#endregion
//#region src/highlighter/languages/resolveLanguages.ts
async function resolveLanguages(languages) {
	const resolvedLanguages = [];
	const languagesToResolve = [];
	for (const language of languages) {
		if (language === "text" || language === "ansi") continue;
		const maybeResolvedLanguage = getResolvedOrResolveLanguage(language) ?? resolveLanguage(language);
		if ("then" in maybeResolvedLanguage) languagesToResolve.push(maybeResolvedLanguage);
		else resolvedLanguages.push(maybeResolvedLanguage);
	}
	if (languagesToResolve.length > 0) await Promise.all(languagesToResolve).then((_resolvedLanguages) => {
		for (const resolvedLanguage of _resolvedLanguages) {
			if (resolvedLanguage == null) throw new Error("resolvedLanguages: unable to resolve language");
			resolvedLanguages.push(resolvedLanguage);
		}
	});
	return resolvedLanguages;
}
//#endregion
//#region src/editor/utils.ts
function debounce(func, wait) {
	let timeout;
	return function(...args) {
		clearTimeout(timeout);
		timeout = setTimeout(() => func.apply(this, args), wait);
	};
}
//#endregion
//#region src/highlighter/shiki-editor.ts
const TOKENIZE_TIME_LIMIT = 0;
const SLICE_BUDGET_MS = 1;
let nextTokenizerId = 0;
/**
* Colors an editable document with a TextMate grammar, a line at a time.
*
* Every line has a record with the grammar state at its start, moved with
* the line when lines are added or removed above it. The state in a record
* is the state the line was last colored from. Edits mark lines dirty;
* `advance` colors dirty lines in order, delivers them, and stops once a
* line's end state matches the state the next line was colored from, since
* everything below is then unaffected. Lines that have never been colored
* show the highlight result, which is right for their text, so reaching one
* of them only needs its state.
*/
var ShikiEditorTokenizer = class {
	backend;
	#highlighter;
	#grammar;
	#themeName;
	#colorMap;
	#textDocument;
	#tokenizeMaxLineLength;
	#onDeferTokenize;
	#matchBrackets;
	#debug;
	#disposed = false;
	#lines = [{
		state: INITIAL,
		brackets: void 0
	}];
	#dirty = [];
	#coldTarget = -1;
	#paused = false;
	#generation = 0;
	#tokenizerId = ++nextTokenizerId;
	#listening = false;
	#primeLater = debounce(async (end) => {
		if (this.#disposed) return;
		if (this.#grammar == null && !isGrammarlessLanguage(this.#textDocument.languageId)) {
			await this.backend?.loadLanguages([this.#textDocument.languageId]);
			if (this.#disposed) return;
			this.#grammar = this.#highlighter.getLanguage(this.#textDocument.languageId);
		}
		this.#ensureActiveTheme();
		this.#coldTarget = Math.max(this.#coldTarget, end);
		this.#schedule();
	}, 500);
	#onMessage = ({ data }) => {
		if (typeof data !== "object" || data === null) return;
		const { type, tokenizerId, jobId } = data;
		if (type === "tokenize" && tokenizerId === this.#tokenizerId && jobId === this.#generation) this.#slice();
	};
	constructor(highlighter, options, backend) {
		this.backend = backend;
		this.#highlighter = highlighter;
		this.#textDocument = options.textDocument;
		this.#themeName = options.theme;
		this.#colorMap = [];
		this.#tokenizeMaxLineLength = options.tokenizeMaxLineLength ?? 1e3;
		this.#onDeferTokenize = options.onDeferTokenize;
		this.#matchBrackets = options.matchBrackets !== false;
		this.#debug = options.__debug ?? false;
		this.#ensureGrammar();
		this.#ensureActiveTheme();
	}
	/**
	* Takes an edit: marks its lines dirty, moves the states and dirty lines
	* below it, and colors from the first dirty line for up to a millisecond.
	* Returns every line colored, in and above `window`. The rest continues
	* in the background.
	*/
	applyChange(change, window) {
		this.#ensureGrammar();
		this.#ensureActiveTheme();
		if (this.#grammar == null && !isGrammarlessLanguage(this.#textDocument.languageId)) throw new Error(`Grammar for language "${this.#textDocument.languageId}" not loaded`);
		const lineChanges = lineChangesOf(change);
		this.#lines = moveLineEntries(this.#lines, lineChanges, () => void 0).entries;
		this.#moveDirtyLines(lineChanges);
		this.#addDirty(change.changedLineRanges ?? [[change.startLine, change.endLine]]);
		this.#paused = false;
		const until = window == null ? this.#textDocument.lineCount : window[1];
		const lines = this.advance(until, window == null ? void 0 : SLICE_BUDGET_MS);
		this.#schedule();
		return lines;
	}
	/**
	* Colors every dirty line before `end` now and returns them. A pause stays
	* in force: the rest waits for `resume`.
	*/
	flush(end) {
		this.#ensureGrammar();
		this.#ensureActiveTheme();
		const lines = this.advance(end);
		this.#schedule();
		return lines;
	}
	/**
	* Builds the states of the lines up to the attach window's end in the
	* background, so the first edit there starts from a known state. The rows
	* keep what they show until an edit colors them.
	*/
	prime(window) {
		this.#ensureGrammar();
		this.#primeLater(window[1]);
	}
	/**
	* The string, comment and regexp ranges of a line, from its last coloring,
	* or lexed now for a line never colored. Null without a grammar.
	*/
	bracketIgnoredRanges(line) {
		this.#ensureGrammar();
		if (this.#grammar == null) return null;
		if (this.#lines[line]?.brackets === void 0) {
			const state = this.#lexState(line, this.#stateAt(line));
			if (this.#lines[line + 1] == null) this.#setState(line + 1, state);
		}
		return this.#lines[line]?.brackets ?? null;
	}
	setTheme(themeName) {
		if (this.#themeName === themeName) return;
		this.#themeName = themeName;
		this.#ensureActiveTheme();
		this.#addDirty([[0, this.#textDocument.lineCount - 1]]);
		this.#schedule();
	}
	pause() {
		if (this.#paused) return;
		if (typeof process !== "undefined" && process.env.NODE_ENV === "development" && this.#debug) console.log("[diffs/editor] background tokenization paused");
		this.#paused = true;
		this.#generation++;
	}
	resume() {
		if (!this.#paused) return;
		if (typeof process !== "undefined" && process.env.NODE_ENV === "development" && this.#debug) console.log("[diffs/editor] background tokenization resumed");
		this.#paused = false;
		this.#schedule();
	}
	dispose() {
		this.#disposed = true;
		this.#generation++;
		this.#dirty = [];
		this.#coldTarget = -1;
		this.#stopListening();
	}
	/**
	* Colors dirty lines in order until they settle, `until` is reached, or
	* the budget runs out, and returns what it colored. A dirty range settles
	* once a line past its end ends in the state the next line was colored
	* from; a range whose start state is unknown first builds the states of
	* the lines leading to it.
	*/
	advance(until, budgetMs) {
		const lines = /* @__PURE__ */ new Map();
		if (this.#grammar == null && !isGrammarlessLanguage(this.#textDocument.languageId)) return lines;
		const startedAt = budgetMs == null ? 0 : performance.now();
		const end = Math.min(until, this.#textDocument.lineCount);
		while (this.#dirty.length > 0) {
			const range = this.#dirty[0];
			let line = range[0];
			if (line >= end) break;
			let state = this.#stateAt(line);
			let settled = false;
			while (line < end) {
				const previous = this.#lines[line + 1]?.state;
				const result = this.#tokenizeLineAt(line, state);
				lines.set(line, result.resolvedTokens);
				state = result.state;
				this.#setState(line + 1, state);
				line++;
				if (line > range[1] && previous != null && state.equals(previous)) {
					settled = true;
					break;
				}
				if (budgetMs != null && performance.now() - startedAt > budgetMs) break;
			}
			if (settled || line >= this.#textDocument.lineCount) {
				this.#dirty.shift();
				while (this.#dirty.length > 0 && this.#dirty[0][1] < line) this.#dirty.shift();
				if (this.#dirty.length > 0 && this.#dirty[0][0] < line) this.#dirty[0][0] = line;
				continue;
			}
			range[0] = line;
			if (range[1] < line) range[1] = line;
			break;
		}
		return lines;
	}
	#slice() {
		if (this.#paused || this.#disposed) return;
		this.#ensureActiveTheme();
		const startedAt = performance.now();
		const lines = this.advance(this.#textDocument.lineCount, SLICE_BUDGET_MS);
		if (lines.size > 0) this.#onDeferTokenize(lines);
		if (this.#dirty.length === 0 && this.#coldTarget >= 0) {
			const target = Math.min(this.#coldTarget, this.#textDocument.lineCount);
			let line = this.#knownThrough();
			let state = this.#lines[line]?.state ?? INITIAL;
			while (line < target) {
				state = this.#lexState(line, state);
				line++;
				this.#setState(line, state);
				if (performance.now() - startedAt > SLICE_BUDGET_MS) break;
			}
			if (line >= target) this.#coldTarget = -1;
		}
		this.#schedule();
	}
	#schedule() {
		if (this.#paused || this.#disposed || this.#dirty.length === 0 && this.#coldTarget < 0 || isGrammarlessLanguage(this.#textDocument.languageId)) {
			this.#stopListening();
			return;
		}
		const jobId = ++this.#generation;
		if (!this.#listening) {
			globalThis.addEventListener("message", this.#onMessage);
			this.#listening = true;
		}
		globalThis.postMessage({
			type: "tokenize",
			tokenizerId: this.#tokenizerId,
			jobId
		});
	}
	#stopListening() {
		if (!this.#listening) return;
		globalThis.removeEventListener("message", this.#onMessage);
		this.#listening = false;
	}
	#addDirty(ranges) {
		const merged = [];
		let mine = 0;
		let theirs = 0;
		while (mine < this.#dirty.length || theirs < ranges.length) {
			const own = this.#dirty[mine];
			const added = ranges[theirs];
			let next;
			if (added == null || own != null && own[0] <= added[0]) {
				next = own;
				mine++;
			} else {
				next = added;
				theirs++;
			}
			if (next[1] < next[0]) continue;
			const last = merged[merged.length - 1];
			if (last != null && next[0] <= last[1] + 1) last[1] = Math.max(last[1], next[1]);
			else merged.push([next[0], next[1]]);
		}
		this.#dirty = merged;
	}
	#moveDirtyLines(lineChanges) {
		for (const [start, end, lineDelta] of lineChanges) {
			const oldEnd = end - lineDelta;
			for (const range of this.#dirty) {
				if (range[1] < start) continue;
				if (range[0] > oldEnd) {
					range[0] += lineDelta;
					range[1] += lineDelta;
				} else {
					range[0] = Math.min(range[0], start);
					range[1] = Math.max(range[1] + lineDelta, end);
				}
			}
		}
	}
	#knownThrough() {
		let line = Math.min(this.#lines.length - 1, this.#textDocument.lineCount);
		while (line > 0 && this.#lines[line] == null) line--;
		return line;
	}
	#stateAt(line) {
		const known = this.#lines[line]?.state;
		if (known != null) return known;
		let at = this.#knownThrough();
		if (at > line) {
			at = line;
			while (at > 0 && this.#lines[at] == null) at--;
		}
		let state = this.#lines[at]?.state ?? INITIAL;
		for (; at < line; at++) {
			state = this.#lexState(at, state);
			this.#setState(at + 1, state);
		}
		return state;
	}
	#setState(line, state) {
		const record = this.#lines[line];
		if (record == null) this.#lines[line] = {
			state,
			brackets: void 0
		};
		else record.state = state;
	}
	#ensureActiveTheme() {
		if (this.#themeName === "") return;
		this.backend?.getTheme(this.#themeName);
		const { colorMap } = this.#highlighter.setTheme(this.#themeName);
		this.#colorMap = colorMap;
	}
	#ensureGrammar() {
		if (this.#grammar == null && !isGrammarlessLanguage(this.#textDocument.languageId) && this.#highlighter.getLoadedLanguages().includes(this.#textDocument.languageId)) this.#grammar = this.#highlighter.getLanguage(this.#textDocument.languageId);
	}
	#tokenizeLineAt(line, state) {
		const lineText = this.#textDocument.getLineText(line);
		if (lineText.length >= this.#tokenizeMaxLineLength) {
			console.warn(`[diffs] Line(${line}) too long to tokenize: ${lineText.length}`);
			this.#cacheBracketRanges(line, null);
			return {
				resolvedTokens: [[
					0,
					"",
					lineText
				]],
				state
			};
		}
		if (this.#grammar == null || lineText === "" || lineText.trim() === "") {
			this.#cacheBracketRanges(line, null);
			return {
				resolvedTokens: [[
					0,
					"",
					lineText
				]],
				state
			};
		}
		const result = tokenizeLine(this.#grammar, this.#colorMap, lineText, state, TOKENIZE_TIME_LIMIT, this.#matchBrackets);
		this.#cacheBracketRanges(line, result.bracketIgnoredRanges);
		return {
			resolvedTokens: result.resolvedTokens,
			state: result.ruleStack
		};
	}
	#lexState(line, state) {
		const lineText = this.#textDocument.getLineText(line);
		if (this.#grammar == null || lineText.length >= this.#tokenizeMaxLineLength || lineText === "" || lineText.trim() === "") {
			this.#cacheBracketRanges(line, null);
			return state;
		}
		const result = tokenizeLine(this.#grammar, this.#colorMap, lineText, state, TOKENIZE_TIME_LIMIT, this.#matchBrackets, false);
		this.#cacheBracketRanges(line, result.bracketIgnoredRanges);
		return result.ruleStack;
	}
	#cacheBracketRanges(line, ranges) {
		if (!this.#matchBrackets) return;
		const record = this.#lines[line];
		if (record == null) throw new Error(`ShikiEditorTokenizer: line ${line} has no record`);
		record.brackets = ranges;
	}
};
function tokenizeLine(grammar, colorMap, lineText, stateStack, timeLimit, collectBracketIgnoredRanges = true, resolveTokens = true) {
	const result = grammar.tokenizeLine2(lineText, stateStack, timeLimit);
	if (result.stoppedEarly) console.warn(`[diffs] Time limit reached when tokenizing line: ${lineText.substring(0, 100)}`);
	const rawTokens = result.tokens;
	const tokensLength = rawTokens.length / 2;
	const resolvedTokens = [];
	const bracketIgnoredRanges = [];
	if (!resolveTokens && !collectBracketIgnoredRanges) return {
		ruleStack: result.ruleStack,
		resolvedTokens,
		bracketIgnoredRanges
	};
	for (let j = 0; j < tokensLength; j++) {
		const offset = rawTokens[2 * j];
		const nextOffset = j + 1 < tokensLength ? rawTokens[2 * j + 2] : lineText.length;
		if (offset === nextOffset) continue;
		const metadata = rawTokens[2 * j + 1];
		if (resolveTokens) {
			const fg = EncodedTokenMetadata.getForeground(metadata);
			resolvedTokens.push([
				offset,
				colorMap[fg],
				lineText.slice(offset, nextOffset)
			]);
		}
		if (collectBracketIgnoredRanges && EncodedTokenMetadata.getTokenType(metadata) > 0) bracketIgnoredRanges.push([offset, nextOffset]);
	}
	return {
		ruleStack: result.ruleStack,
		resolvedTokens,
		bracketIgnoredRanges
	};
}
function isGrammarlessLanguage(languageId) {
	return languageId === "text" || languageId === "ansi";
}
//#endregion
//#region src/highlighter/shiki-stream.ts
var ShikiStreamTokenizer = class ShikiStreamTokenizer extends BaseStreamTokenizer {
	highlighter;
	options;
	#tail = "";
	#grammarState;
	constructor(highlighter, options) {
		super();
		this.highlighter = highlighter;
		this.options = options;
	}
	tokenizeChunk(chunk, stable) {
		const chunkLines = (this.#tail + chunk).split(/(\r\n|\r|\n)/);
		let unstable = [];
		for (let i = 0; i < chunkLines.length; i += 2) {
			const line = chunkLines[i];
			const result = this.highlighter.codeToTokens(line, {
				...this.options,
				grammarState: this.#grammarState
			});
			const tokens = result.tokens[0].map((token) => ({
				...token,
				offset: token.offset + this.stableOffset
			}));
			if (i + 1 < chunkLines.length) {
				appendItems(stable, tokens);
				this.pushLineBreak(stable, line.length, chunkLines[i + 1]);
				this.#grammarState = result.grammarState;
			} else {
				unstable = tokens;
				this.#tail = line;
			}
		}
		return {
			unstable,
			tailLength: this.#tail.length
		};
	}
	clone() {
		this.assertActive();
		const clone = new ShikiStreamTokenizer(this.highlighter, this.options);
		this.copyStateTo(clone);
		clone.#tail = this.#tail;
		clone.#grammarState = this.#grammarState;
		return clone;
	}
	resetSource() {
		this.#tail = "";
		this.#grammarState = void 0;
	}
	releaseSource() {
		this.resetSource();
	}
};
//#endregion
//#region src/highlighter/backends/shiki.ts
var ShikiHighlighter = class ShikiHighlighter extends DiffsHighlighter {
	raw;
	loadedThemes = /* @__PURE__ */ new Map();
	attachedLanguages = /* @__PURE__ */ new Set(["text", "ansi"]);
	static async create(name) {
		const engine = name === "shiki-wasm" ? (await import("shiki/engine/oniguruma")).createOnigurumaEngine(import("shiki/wasm")) : (await import("shiki/engine/javascript")).createJavaScriptRegexEngine();
		const raw = await createHighlighterCore({
			themes: [],
			langs: [],
			engine
		});
		return new ShikiHighlighter(name, raw);
	}
	constructor(name, raw) {
		super(name, createDiffsThemeResolver(name));
		this.raw = raw;
	}
	getTheme(themeName) {
		this.assertNotDisposed();
		const loaded = this.loadedThemes.get(themeName);
		const theme = this.themeResolver.getResolvedTheme(themeName) ?? loaded;
		if (theme == null) throw new Error(`Theme "${themeName}" has not been resolved`);
		if (loaded !== theme) {
			const textmate = theme.textmate ?? (theme.cssVariables != null ? createCssVariablesTheme(theme.cssVariables) : void 0);
			if (textmate == null) throw new Error(`Theme "${themeName}" does not support Shiki`);
			this.raw.setTheme({
				...textmate,
				name: themeName
			});
			this.loadedThemes.set(themeName, theme);
		}
		return theme;
	}
	codeToTokens(code, options) {
		return this.raw.codeToTokens(code, this.resolveOptions(options));
	}
	createEditorTokenizer(options) {
		return new DiffsEditorTokenizer(new ShikiEditorTokenizer(this.raw, options, this), options);
	}
	createStreamTokenizer(options) {
		return new ShikiStreamTokenizer(this.raw, this.resolveOptions(options));
	}
	async loadLanguages(languages) {
		this.assertNotDisposed();
		const missing = languages.filter((language) => !this.attachedLanguages.has(language));
		attachResolvedLanguages(await resolveLanguages(missing), this);
	}
	hasLoadedLanguages(languages) {
		if (this.disposed) return false;
		let loaded;
		return languages.every((lang) => {
			if (this.attachedLanguages.has(lang)) return true;
			if (RegisteredCustomLanguages.has(lang)) return false;
			loaded ??= this.raw.getLoadedLanguages();
			return loaded.includes(lang);
		});
	}
	attachLanguages(languages) {
		this.assertNotDisposed();
		for (const lang of languages) {
			if (this.attachedLanguages.has(lang.name)) continue;
			const grammar = lang.data.find((grammar) => grammar.name === lang.name || grammar.aliases?.includes(lang.name) === true);
			if (grammar == null) throw new Error(`attachResolvedLanguages: No returned grammar declares "${lang.name}" as its name or an alias.`);
			this.raw.loadLanguageSync(lang.data);
			try {
				this.raw.getLanguage(lang.name);
			} catch {
				throw new Error(`attachResolvedLanguages: "${grammar.name}" is already loaded without alias "${lang.name}". Load the alias first or give the grammar a unique name.`);
			}
			this.attachedLanguages.add(lang.name);
		}
	}
	releaseResources() {
		this.loadedThemes.clear();
		this.attachedLanguages.clear();
		this.raw.dispose();
	}
	resolveOptions({ theme, themes, ...options }) {
		this.assertNotDisposed();
		if (theme != null) {
			this.getTheme(theme);
			return {
				...options,
				theme
			};
		}
		if (themes == null) throw new Error("A theme or themes option is required");
		for (const name of Object.values(themes)) this.getTheme(name);
		return {
			...options,
			themes
		};
	}
};
//#endregion
export { ShikiHighlighter };

//# sourceMappingURL=shiki-DxP4sN1Z.js.map
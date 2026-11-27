import { formatCSSVariablePrefix } from "../utils/formatCSSVariablePrefix.js";
import { LiveTokenizer } from "@pierre/highlights";
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
export { HighlightsEditorTokenizer };

//# sourceMappingURL=highlights-editor.js.map
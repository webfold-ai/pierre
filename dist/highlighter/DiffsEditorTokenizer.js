import { lineAfterChange } from "./linesAfterChange.js";
//#region src/highlighter/DiffsEditorTokenizer.ts
/**
* The editor's side of a backend tokenizer. Every line a backend colors reaches
* the editor with the edit that caused it, or through the background
* delivery, never both: lines a bracket read colored wait until the read's
* caller returns, then ride with the next edit or are delivered on their own.
*/
var DiffsEditorTokenizer = class {
	#backend;
	#options;
	#disposed = false;
	#pendingDelivery;
	constructor(backend, options) {
		this.#backend = backend;
		this.#options = options;
	}
	/**
	* Applies an edit and returns every line whose tokens changed with it,
	* in and above `renderRange`. Lines a bracket read colored before the
	* edit come along, renumbered; lines the edit rewrote are colored again.
	*/
	tokenize(change, renderRange) {
		const lines = /* @__PURE__ */ new Map();
		const pending = this.#pendingDelivery;
		this.#pendingDelivery = void 0;
		if (pending != null) for (const [line, tokens] of pending) {
			const moved = lineAfterChange(line, change);
			if (moved != null) lines.set(moved, tokens);
		}
		const colored = this.#backend.applyChange(change, renderRange == null ? void 0 : this.#window(renderRange));
		for (const [line, tokens] of colored) lines.set(line, tokens);
		return lines;
	}
	/**
	* Gets the attach window ready before the first edit. With `domCurrent`
	* the rows on screen already match the document, so a backend that
	* delivers what it lexes keeps the window's lines to itself.
	*/
	prebuildStateStack(renderRange, domCurrent = false) {
		this.#backend.prime(this.#window(renderRange), domCurrent);
	}
	/** Finishes every line up to the end of `renderRange` and returns them. */
	flush(renderRange) {
		const lines = this.#backend.flush(this.#window(renderRange)[1]);
		if (this.#pendingDelivery != null) for (const line of lines.keys()) this.#pendingDelivery.delete(line);
		return lines;
	}
	/**
	* The string, comment and regexp ranges of a line, for bracket matching.
	* Runs inside the editor's own event handling, so the lines it colors on
	* the way are delivered once the caller returns.
	*/
	getStringCommentRegexpRangesInLine(lineIndex) {
		const document = this.#options.textDocument;
		if (this.#options.matchBrackets === false || lineIndex < 0 || lineIndex >= document.lineCount) return null;
		this.#queueDelivery(this.#backend.flush(lineIndex + 1));
		return this.#backend.bracketIgnoredRanges(lineIndex);
	}
	setTheme(themeName) {
		this.#pendingDelivery = void 0;
		this.#backend.setTheme(themeName);
	}
	pauseBackgroundTokenize() {
		this.#backend.pause();
	}
	resumeBackgroundTokenize() {
		this.#backend.resume();
	}
	dispose() {
		this.#disposed = true;
		this.#pendingDelivery = void 0;
		this.#backend.dispose();
	}
	#window(renderRange) {
		const { lineCount } = this.#options.textDocument;
		const start = Math.min(renderRange?.startingLine ?? 0, lineCount);
		return [start, Math.min(start + (renderRange?.totalLines ?? Infinity), lineCount)];
	}
	#queueDelivery(lines) {
		if (lines.size === 0) return;
		const pending = this.#pendingDelivery;
		if (pending != null) {
			for (const [line, tokens] of lines) pending.set(line, tokens);
			return;
		}
		this.#pendingDelivery = lines;
		queueMicrotask(() => {
			const batch = this.#pendingDelivery;
			this.#pendingDelivery = void 0;
			if (batch != null && batch.size > 0 && !this.#disposed) this.#options.onDeferTokenize(batch);
		});
	}
};
//#endregion
export { DiffsEditorTokenizer };

//# sourceMappingURL=DiffsEditorTokenizer.js.map
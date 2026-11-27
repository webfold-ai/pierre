import { LiveTokenizer, codeToHtml, isRegisteredLanguage, isSupportedLanguage } from "@pierre/highlights";
//#region react/highlights.ts
const decoder = new TextDecoder();
/** Highlight code with `@pierre/highlights`. An open fence keeps a live tokenizer. */
function createHighlightsPlugin(options) {
	const highlight = ({ code, language }) => {
		if (!isSupportedLanguage(language) && !isRegisteredLanguage(language)) return null;
		const html = decoder.decode(codeToHtml(code, {
			...options,
			lang: language
		}));
		const start = html.indexOf("<code>") + 6;
		return html.slice(start, html.lastIndexOf("</code>"));
	};
	return {
		highlight,
		createSession() {
			let tokenizer;
			let previous = "";
			let language = "";
			let lines = [];
			let prefixHtml = "";
			let prefixLineCount = 0;
			let result;
			const dispose = () => {
				tokenizer?.dispose();
				tokenizer = void 0;
				previous = "";
				lines = [];
				prefixHtml = "";
				prefixLineCount = 0;
				result = void 0;
			};
			/** Keep the HTML of finished lines, and return only the changed lines. */
			const highlightLines = ({ code, language: nextLanguage, isIncomplete }) => {
				if (!isSupportedLanguage(nextLanguage) && !isRegisteredLanguage(nextLanguage)) {
					dispose();
					return null;
				}
				if (code.includes("\r")) code = code.replace(/\r\n?/g, "\n");
				if (language !== nextLanguage) {
					dispose();
					language = nextLanguage;
				}
				let first = 0;
				const previousLineCount = lines.length;
				const previousContentLine = Math.max(0, previousLineCount - (previous.endsWith("\n") ? 2 : 1));
				if (code === previous && result !== void 0) {
					const unchanged = result;
					return {
						firstLine: lines.length,
						lineCount: lines.length,
						html: "",
						lastLineOffset: 0,
						get fullHtml() {
							return unchanged.fullHtml;
						}
					};
				}
				let fenceLines;
				if (nextLanguage.toLowerCase() === "ansi") {
					fenceLines = highlight({
						code,
						language: nextLanguage,
						meta: "",
						isIncomplete
					}).split("\n");
					const head = previous.endsWith("\n") ? previous.slice(0, -1) : previous;
					if (code.slice(0, head.length) === head) first = previousContentLine;
				} else if (tokenizer === void 0) tokenizer = new LiveTokenizer({
					...options,
					lang: nextLanguage,
					code
				});
				else if (code.slice(0, previous.length) === previous) {
					const line = tokenizer.lineCount - 1;
					const end = {
						line,
						character: tokenizer.getLineLength(line)
					};
					first = tokenizer.applyEdits([{
						range: {
							start: end,
							end
						},
						newText: code.slice(previous.length)
					}]).lineChanges[0]?.newStartLine ?? tokenizer.lineCount;
					first = Math.min(first, previousContentLine);
				} else if (previous.endsWith("\n") && code.slice(0, previous.length - 1) === previous.slice(0, -1)) {
					const line = tokenizer.lineCount - 2;
					const update = tokenizer.applyEdits([{
						range: {
							start: {
								line,
								character: tokenizer.getLineLength(line)
							},
							end: {
								line: line + 1,
								character: 0
							}
						},
						newText: code.slice(previous.length - 1)
					}]);
					first = Math.min(update.lineChanges[0]?.newStartLine ?? tokenizer.lineCount, previousContentLine);
				} else tokenizer.reset(code);
				const lineCount = fenceLines?.length ?? tokenizer.lineCount;
				const lastContentLine = Math.max(0, lineCount - (code.endsWith("\n") ? 2 : 1));
				first = Math.min(first, lastContentLine);
				if (first < prefixLineCount) {
					prefixHtml = "";
					prefixLineCount = 0;
				}
				for (let line = prefixLineCount; line < first; line++) prefixHtml += lines[line] + "\n";
				prefixLineCount = first;
				lines.length = first;
				let html = "";
				let lastLineOffset = 0;
				for (let line = first; line < lineCount; line++) {
					const value = fenceLines?.[line] ?? tokenizer.getLineHtml(line);
					lines.push(value);
					if (line > first) html += "\n";
					if (line === lastContentLine) lastLineOffset = html.length;
					html += value;
				}
				previous = code;
				const prefix = prefixHtml;
				let fullHtml;
				result = {
					firstLine: first,
					lineCount,
					html,
					lastLineOffset,
					get fullHtml() {
						return fullHtml ??= prefix + html;
					}
				};
				return result;
			};
			return {
				dispose,
				highlightLines,
				highlight(options) {
					return highlightLines(options)?.fullHtml ?? null;
				}
			};
		}
	};
}
//#endregion
export { createHighlightsPlugin };

//# sourceMappingURL=highlights.js.map
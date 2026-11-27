//#region src/utils/lineEndings.ts
/** The line ending a file uses, read from its first line break. */
function lineEndingOf(text) {
	const first = /\r\n|\r|\n/.exec(text)?.[0];
	return first === "\r\n" || first === "\r" ? first : "\n";
}
/** `text` with every line break rewritten to `\n`. */
function normalizeLineBreaks(text) {
	return text.includes("\r") ? text.replace(/\r\n|\r/g, "\n") : text;
}
/** `text` with every line break rewritten to the one its first line uses. */
function uniformLineEndings(text) {
	if (!text.includes("\r")) return text;
	const eol = lineEndingOf(text);
	return text.replace(/\r\n|\r|\n/g, eol);
}
//#endregion
export { lineEndingOf, normalizeLineBreaks, uniformLineEndings };

//# sourceMappingURL=lineEndings.js.map
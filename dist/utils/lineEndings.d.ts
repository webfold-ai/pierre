//#region src/utils/lineEndings.d.ts
type LineEnding = '\n' | '\r\n' | '\r';
/** The line ending a file uses, read from its first line break. */
declare function lineEndingOf(text: string): LineEnding;
/** `text` with every line break rewritten to `\n`. */
declare function normalizeLineBreaks(text: string): string;
/** `text` with every line break rewritten to the one its first line uses. */
declare function uniformLineEndings(text: string): string;
//#endregion
export { LineEnding, lineEndingOf, normalizeLineBreaks, uniformLineEndings };
//# sourceMappingURL=lineEndings.d.ts.map
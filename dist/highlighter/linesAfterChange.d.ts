import { TextDocumentChange } from "../editor/textDocument.js";
//#region src/highlighter/linesAfterChange.d.ts
declare function lineAfterChange(line: number, change: TextDocumentChange): number | undefined;
declare function lineRangesAfterChange(ranges: readonly (readonly [number, number])[], change: TextDocumentChange): [number, number][];
//#endregion
export { lineAfterChange, lineRangesAfterChange };
//# sourceMappingURL=linesAfterChange.d.ts.map
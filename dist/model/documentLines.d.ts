import { DocumentLineChange, DocumentLines } from "./types.js";
//#region src/model/documentLines.d.ts
declare function readChangedLines(document: DocumentLines, change: DocumentLineChange): Map<number, string>;
declare function readAllLines(document: DocumentLines): {
  lines: string[];
  characterCount: number;
};
//#endregion
export { readAllLines, readChangedLines };
//# sourceMappingURL=documentLines.d.ts.map
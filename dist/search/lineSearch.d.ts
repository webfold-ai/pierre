import { SearchParams } from "./index.js";
//#region src/search/lineSearch.d.ts
declare function compileSearchQuery(searchParams: SearchParams): RegExp | undefined;
declare function matchSearchLine(pattern: RegExp, lineText: string, wholeWord: boolean, visitMatch: (startCharacter: number, endCharacter: number) => boolean): boolean;
//#endregion
export { compileSearchQuery, matchSearchLine };
//# sourceMappingURL=lineSearch.d.ts.map
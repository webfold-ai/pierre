import { FileContents, FileDiffMetadata, ParseDiffOptions } from "../types.js";
//#region src/utils/parseDiffFromFile.d.ts
/**
 * Parses a diff from two file contents objects.
 *
 * If both `oldFile` and `newFile` have a `cacheKey`, the resulting diff gets a
 * collision-safe key derived from both values and the line-matching mode.
 */
declare function parseDiffFromFile(oldFile: FileContents | null, newFile: FileContents | null, { preferredDiffLib, disableLineMatching, ...diffOptions }?: ParseDiffOptions, throwOnError?: boolean): FileDiffMetadata;
//#endregion
export { parseDiffFromFile };
//# sourceMappingURL=parseDiffFromFile.d.ts.map
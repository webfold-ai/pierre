import { FileDiffLoadedFiles, FileDiffMetadata, ParseDiffOptions } from "../types.js";
//#region src/utils/hydratePartialDiff.d.ts
/**
 * Hydrates a partial diff with full file line arrays, preserving its hunks.
 * Pass the options used to parse the patch so derived cache keys distinguish
 * line-matching modes.
 */
declare function hydratePartialDiff(type: 'clone' | 'merge', fileDiff: FileDiffMetadata, files: FileDiffLoadedFiles, parseDiffOptions?: ParseDiffOptions): FileDiffMetadata;
//#endregion
export { hydratePartialDiff };
//# sourceMappingURL=hydratePartialDiff.d.ts.map
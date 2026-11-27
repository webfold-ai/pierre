import { FileContents, FileDiffMetadata, ParsePatchOptions, ParsedPatch } from "../types.js";
//#region src/utils/parsePatchFiles.d.ts
declare function processPatch(data: string, options?: ParsePatchOptions): ParsedPatch;
interface ProcessFileOptions {
  disableLineMatching?: boolean;
  cacheKey?: string;
  isGitDiff?: boolean;
  oldFile?: FileContents;
  newFile?: FileContents;
  throwOnError?: boolean;
}
declare function processFile(fileDiffString: string, options?: ProcessFileOptions): FileDiffMetadata | undefined;
/**
 * Parses a patch file string into an array of parsed patches.
 *
 * @param data - The raw patch file content (supports multi-commit patches)
 * @param options - Options for parsing patch text and generating cache keys.
 */
declare function parsePatchFiles(data: string, options?: ParsePatchOptions): ParsedPatch[];
//#endregion
export { parsePatchFiles, processFile, processPatch };
//# sourceMappingURL=parsePatchFiles.d.ts.map
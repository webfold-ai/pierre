import { ChangeContent, ContextContent, FileDiffMetadata, Hunk, ParseDiffOptions } from "../types.js";
//#region src/utils/updateDiffHunks.d.ts
type HunkContent = ContextContent | ChangeContent;
type HunkMetadataUpdate = Pick<FileDiffMetadata, 'hunks' | 'splitLineCount' | 'unifiedLineCount' | 'type'>;
type FullDiffHunkUpdate = HunkMetadataUpdate & Pick<FileDiffMetadata, 'additionLines' | 'deletionLines' | 'additionCharacterCount' | 'deletionCharacterCount'>;
/** Rebuilds all hunk metadata from the current deletion/addition line arrays. */
declare function recomputeDiffHunks(diff: FileDiffMetadata, parseDiffOptions?: ParseDiffOptions): FullDiffHunkUpdate;
declare function shouldTopAlignAdditionRecompute(diff: FileDiffMetadata, additionLines: string[]): boolean;
declare function recomputeTopAlignedAdditionDiff(diff: FileDiffMetadata, additionLines: string[], additionCharacterCount: number, parseDiffOptions?: ParseDiffOptions): FullDiffHunkUpdate;
declare function recomputeEmptyDocumentDiff(diff: FileDiffMetadata, parseDiffOptions?: ParseDiffOptions): FullDiffHunkUpdate;
/** Rebuilds diff hunks after an edit, top-aligning sparse addition sides when needed. */
declare function recomputeDiffHunksForEdit(diff: FileDiffMetadata, parseDiffOptions?: ParseDiffOptions): FullDiffHunkUpdate;
/** Updates hunk metadata after addition lines change; re-parses affected hunks only. */
declare function updateDiffHunks(diff: FileDiffMetadata, changedAdditionLineIndexes: Iterable<number>, parseDiffOptions?: ParseDiffOptions): HunkMetadataUpdate;
declare function syncHunkNoEOFCRFromFullFile(diff: FileDiffMetadata, hunkIndex: number): void;
declare function offsetHunkContent(content: HunkContent, additionOffset: number, deletionOffset: number): HunkContent;
declare function recomputeHunkRenderLineCounts(hunk: Hunk): void;
declare function recomputeDiffRenderLineCounts(diff: Pick<FileDiffMetadata, 'hunks' | 'splitLineCount' | 'unifiedLineCount' | 'additionLines'>): void;
//#endregion
export { offsetHunkContent, recomputeDiffHunks, recomputeDiffHunksForEdit, recomputeDiffRenderLineCounts, recomputeEmptyDocumentDiff, recomputeHunkRenderLineCounts, recomputeTopAlignedAdditionDiff, shouldTopAlignAdditionRecompute, syncHunkNoEOFCRFromFullFile, updateDiffHunks };
//# sourceMappingURL=updateDiffHunks.d.ts.map
import { MatchRange, SearchMatchVisitor, SearchParams } from "../search/index.js";
import { LineEnding } from "../utils/lineEndings.js";
import { EditHistoryState, EditorChange, EditorLineAnnotation, EditorSelection, EditorType, Position, Range, ResolvedTextEdit, TextEdit } from "./types.js";
import { EditStack } from "./editStack.js";
//#region src/editor/textDocument.d.ts
interface TextDocumentChange {
  /** The edits that were applied to the text document. */
  readonly changes: EditorChange[];
  /** First line whose rendered content or tokenizer state may have changed. */
  readonly startLine: number;
  /** Character on the first changed line where the edit began. */
  readonly startCharacter: number;
  /** Character on the original last changed line where the edit ended. */
  readonly endCharacter: number;
  /** Last line whose rendered content may have changed after the edit. */
  readonly endLine: number;
  /** Whether the original edit range ended at the previous document EOF. */
  readonly endedAtDocumentEnd: boolean;
  /** Line count before the edit was applied. */
  readonly previousLineCount: number;
  /** Line count after the edit was applied. */
  readonly lineCount: number;
  /** Difference between the old and new line counts. */
  readonly lineDelta: number;
  /** Exact rendered line ranges touched by each edit after the edit was applied. */
  readonly changedLineRanges: readonly [startLine: number, endLine: number][];
  /** Per-edit rendered line ranges before adjacent ranges are coalesced. */
  readonly changedLineChanges?: readonly [startLine: number, endLine: number, lineDelta: number, startCharacter?: number, endCharacter?: number, endedAtDocumentEnd?: boolean][];
}
/**
 * Whether a change moved lines: it added or removed a line break somewhere,
 * even when a batch did both and the line count came out the same. Rows below
 * such an edit show other lines afterwards.
 */
declare function changeMovesLines(change: TextDocumentChange): boolean;
type TextDocumentHistoryResult<EType extends EditorType, LAnnotation> = [change: TextDocumentChange, selections?: EditorSelection[], lineAnnotations?: EditorLineAnnotation<EType, LAnnotation>[], selectionEdits?: ResolvedTextEdit[]];
/**
 * A vscode-languageserver-textdocument compatible text document.
 */
declare class TextDocument<EType extends EditorType = EditorType, LAnnotation = unknown> {
  #private;
  constructor(uri: string, text: string, languageId?: string, version?: number, editStack?: EditStack<EType, LAnnotation>, eol?: LineEnding);
  get uri(): string;
  get languageId(): string;
  get version(): number;
  get lineCount(): number;
  get eol(): LineEnding;
  get history(): EditHistoryState<EType, LAnnotation>;
  get canUndo(): boolean;
  get canRedo(): boolean;
  /** Clear undo and redo history without changing the document contents. */
  clearHistory(): void;
  positionAt(offset: number): Position;
  positionsAt(offsets: readonly number[]): Position[];
  offsetAt(position: Position): number;
  /** The text, with the file's line ending. */
  getText(range?: Range): string;
  /** A line's text; with `includeLineBreak`, ending in the file's line ending. */
  getLineText(line: number, includeLineBreak?: boolean): string;
  /**
   * Takes the line ending of `text` as the file's. The document's own line
   * breaks stay `\n`; only what leaves the document changes.
   */
  adoptLineEnding(text: string): void;
  normalizeEol(text: string): string;
  getLineLength(line: number, includeLineBreak?: boolean): number;
  charAt(offset: number): string;
  charAt(position: Position): string;
  getTextSlice(start: number, end: number): string;
  findNextNonOverlappingSubstring(needle: string, occupied: readonly [start: number, end: number][]): number | undefined;
  search(searchParams: SearchParams, limit?: number, onMatch?: SearchMatchVisitor): MatchRange[];
  applyEdits(edits: TextEdit[], updateHistory?: boolean, selectionsBefore?: EditorSelection[], selectionsAfter?: EditorSelection[], undoBoundary?: boolean): TextDocumentChange | undefined;
  resolveEdits(edits: readonly TextEdit[]): ResolvedTextEdit[];
  applyResolvedEdits(edits: ResolvedTextEdit[], updateHistory?: boolean, selectionsBefore?: EditorSelection[], selectionsAfter?: EditorSelection[], undoBoundary?: boolean): TextDocumentChange | undefined;
  setLastUndoSelectionsAfter(selections: EditorSelection[]): void;
  setLastUndoLineAnnotations(lineAnnotationsBefore: EditorLineAnnotation<EType, LAnnotation>[], lineAnnotationsAfter: EditorLineAnnotation<EType, LAnnotation>[]): void;
  undo(): TextDocumentHistoryResult<EType, LAnnotation> | undefined;
  redo(): TextDocumentHistoryResult<EType, LAnnotation> | undefined;
  normalizePosition(position: Position): Position;
}
//#endregion
export { type Position, type Range, TextDocument, TextDocumentChange, type TextEdit, changeMovesLines };
//# sourceMappingURL=textDocument.d.ts.map
import { MatchRange, SearchMatchVisitor, SearchParams } from "../search/index.js";
import { Position, Range, ResolvedTextEdit } from "./types.js";
//#region src/editor/pieceTable.d.ts
/**
 * A piece table is a data structure that allows for efficient insertion and
 * deletion of text. It is a tree of pieces, where each piece is a segment of
 * text that is either original or added. The tree is a treap (a binary search
 * tree that also keeps each node's random priority in heap order, which keeps
 * the tree balanced without an explicit rebalancing pass). Each edit reshapes
 * only the nodes along one root-to-leaf path via split and merge in O(log P),
 * instead of rebuilding all P pieces. The text has one kind of line break,
 * `\n`; `TextDocument` rewrites any other before it reaches the table.
 *
 * Inspired by https://code.visualstudio.com/blogs/2018/03/23/text-buffer-reimplementation
 */
declare class PieceTable {
  #private;
  constructor(originalText: string);
  get lineCount(): number;
  getText(range?: Range): string;
  getLineText(line: number, includeLineBreak?: boolean): string;
  getLineLength(line: number, includeLineBreak?: boolean): number;
  getTextSlice(start: number, end: number, trimEOF?: boolean): string;
  charAt(offset: number): string;
  includes(needle: string): boolean;
  findNextNonOverlappingSubstring(needle: string, occupied: readonly [start: number, end: number][]): number | undefined;
  search(searchParams: SearchParams, limit?: number, onMatch?: SearchMatchVisitor): MatchRange[];
  insert(text: string, offset: number): void;
  delete(offset: number, length: number): void;
  applyEdits(edits: readonly ResolvedTextEdit[]): void;
  positionAt(offset: number): Position;
  positionsAt(offsets: readonly number[]): Position[];
  offsetAt(position: Position): number;
}
//#endregion
export { PieceTable };
//# sourceMappingURL=pieceTable.d.ts.map
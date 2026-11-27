import { CodeViewItem, FileDiffMetadata, SelectionSide } from "../types.js";
import { LineCuts } from "../rows/LineCuts.js";
import { SearchParams } from "./index.js";
//#region src/search/codeViewSearch.d.ts
declare const CODE_VIEW_SEARCH_CLOCK_CHECK_CHARACTERS = 65536;
declare const CODE_VIEW_SEARCH_CARRIAGE_RETURN_LOOKAHEAD = 65536;
interface CodeViewSearchLineMetadata {
  itemId: string;
  itemType: CodeViewItem<unknown>['type'];
  side: SelectionSide | undefined;
  lineNumber: number;
  lineIndex: number;
}
interface CodeViewSearchMatch extends CodeViewSearchLineMetadata {
  startCharacter: number;
  endCharacter: number;
  /**
   * True for the one match that stands for the cut-off part of a long line.
   * It is shown on the line's expand button.
   */
  cutOff?: true;
}
interface SearchLineCuts {
  /** The length lines are cut at. Infinity when nothing is cut. */
  cutLength: number;
  /** The lines that were expanded, by side and line number. */
  expandedLines: LineCuts['expandedLines'];
}
interface CodeViewSearchFile {
  type: 'file';
  itemId: string;
  contents: string;
  lineCuts?: SearchLineCuts;
}
interface CodeViewSearchDiff {
  type: 'diff';
  itemId: string;
  fileDiff: FileDiffMetadata;
  additionContents?: string;
  diffStyle: 'split' | 'unified';
  additionsOnly: boolean;
  lineCuts?: SearchLineCuts;
}
type CodeViewSearchItem = CodeViewSearchFile | CodeViewSearchDiff;
type CodeViewSearchItemProvider = (position: number) => CodeViewSearchItem;
type CodeViewSearchLineVisitor = (text: string, side: SelectionSide | undefined, lineNumber: number, lineIndex: number, additionLineNumber?: number, additionLineIndex?: number) => boolean;
declare class CodeViewSearchTextCursor {
  private readonly contents;
  private readonly side?;
  private readonly offsets;
  private ended;
  private lineFeed;
  private carriageReturn;
  private checkedTo;
  private nextLine;
  constructor(contents: string, side?: SelectionSide | undefined);
  readLine(lineIndex: number): string;
  walk(visitLine: CodeViewSearchLineVisitor): boolean;
  private readNewLine;
  private findCarriageReturn;
}
declare class CodeViewSearchDiffCursor {
  private readonly regex;
  private readonly diff;
  private readonly additions;
  private readonly diffStyle;
  private readonly additionsOnly;
  private readonly rows;
  private nextSide;
  constructor(item: CodeViewSearchDiff, regex: boolean);
  walk(visitLine: CodeViewSearchLineVisitor): boolean;
  private visitUnchanged;
  private visitDeletion;
  private visitAddition;
}
interface CodeViewSearchLineSpan {
  lineNumber: number;
  startIndex: number;
  endIndex: number;
}
interface CodeViewSearchItemProgress {
  position: number;
  cursor: CodeViewSearchTextCursor | CodeViewSearchDiffCursor;
  matches: CodeViewSearchMatch[];
  additionLines: CodeViewSearchLineSpan[] | undefined;
  deletionLines: CodeViewSearchLineSpan[] | undefined;
  visitLine: CodeViewSearchLineVisitor;
}
interface CodeViewSearchMatchEntry {
  position: number;
  startIndex: number;
  matches: CodeViewSearchMatch[];
  additionLines: CodeViewSearchLineSpan[] | undefined;
  deletionLines: CodeViewSearchLineSpan[] | undefined;
}
interface CodeViewSearchPositionRange {
  start: number;
  end: number;
}
declare class CodeViewSearchScan {
  private itemCount;
  private readonly getItem;
  private readonly limit;
  private startingItemIndex;
  private static findEntryIndex;
  private readonly pattern;
  private readonly wholeWord;
  private readonly regex;
  private readonly beforeStart;
  private readonly afterStart;
  private progress;
  private readonly unsearched;
  private matchCount;
  private scannedCharacters;
  private deadline;
  private matches;
  constructor(searchParams: SearchParams, itemCount: number, getItem: CodeViewSearchItemProvider, limit: number, startingItemIndex?: number);
  get atLimit(): boolean;
  get finished(): boolean;
  rescanItem(position: number): void;
  addItems(count: number): void;
  removeItem(position: number): void;
  advance(budgetMs?: number, from?: number): boolean;
  getMatches(): CodeViewSearchMatch[];
  getMatchIndex(position: number, match: CodeViewSearchMatch): number | undefined;
  getFirstMatchedEntryAtOrAfter(position: number): CodeViewSearchMatchEntry | undefined;
  hasPendingItems(start: number, end: number): boolean;
  isItemPending(position: number): boolean;
  getItemMatches(position: number): readonly CodeViewSearchMatch[] | undefined;
  getLineMatches(position: number, lineNumber: number, side?: SelectionSide): CodeViewSearchLineSpan | undefined;
  getFirstMatchAtOrAfter(position: number, lineNumber: number, character: number, side?: SelectionSide): CodeViewSearchMatch | undefined;
  private findLineIndex;
  private findItemMatchIndex;
  private isUnsearched;
  private findUnsearchedRangeIndex;
  private getNextPosition;
  private markUnsearched;
  private markSearched;
  private dropItemProgress;
  private getEntry;
  private dropItemMatches;
  private recordItemMatches;
  private prepareItem;
}
declare function areCodeViewSearchMatchesEqual(a: CodeViewSearchMatch, b: CodeViewSearchMatch): boolean;
declare function areOptionalCodeViewSearchMatchesEqual(a: CodeViewSearchMatch | undefined, b: CodeViewSearchMatch | undefined): boolean;
//#endregion
export { CODE_VIEW_SEARCH_CARRIAGE_RETURN_LOOKAHEAD, CODE_VIEW_SEARCH_CLOCK_CHECK_CHARACTERS, CodeViewSearchDiff, CodeViewSearchDiffCursor, CodeViewSearchFile, CodeViewSearchItem, CodeViewSearchItemProgress, CodeViewSearchItemProvider, CodeViewSearchLineMetadata, CodeViewSearchLineSpan, CodeViewSearchLineVisitor, CodeViewSearchMatch, CodeViewSearchMatchEntry, CodeViewSearchPositionRange, CodeViewSearchScan, CodeViewSearchTextCursor, SearchLineCuts, areCodeViewSearchMatchesEqual, areOptionalCodeViewSearchMatchesEqual };
//# sourceMappingURL=codeViewSearch.d.ts.map
import { compileSearchQuery, matchSearchLine } from "./lineSearch.js";
import { CODE_VIEW_SEARCH_CARRIAGE_RETURN_LOOKAHEAD, CODE_VIEW_SEARCH_CLOCK_CHECK_CHARACTERS, CodeViewSearchDiff, CodeViewSearchDiffCursor, CodeViewSearchFile, CodeViewSearchItem, CodeViewSearchItemProgress, CodeViewSearchItemProvider, CodeViewSearchLineMetadata, CodeViewSearchLineSpan, CodeViewSearchLineVisitor, CodeViewSearchMatch, CodeViewSearchMatchEntry, CodeViewSearchPositionRange, CodeViewSearchScan, CodeViewSearchTextCursor, SearchLineCuts, areCodeViewSearchMatchesEqual, areOptionalCodeViewSearchMatchesEqual } from "./codeViewSearch.js";
//#region src/search/index.d.ts
type MatchRange = [startOffset: number, endOffset: number];
interface SearchParams {
  text: string;
  replaceText: string;
  caseSensitive: boolean;
  wholeWord: boolean;
  regex: boolean;
}
type SearchPanelMode = 'find' | 'replace';
/** Matching options a host can preset for a fresh panel. */
type SearchOptionDefaults = Partial<Pick<SearchParams, 'caseSensitive' | 'wholeWord' | 'regex'>>;
/** Search state reported after every change while a panel is open. */
interface SearchPanelState extends SearchParams {
  /** Shown mode: `find` whenever replacement is unavailable. */
  mode: SearchPanelMode;
  /** Whether the host bound replacement for the current scope. */
  canReplace: boolean;
  /** True while the search is still running and more matches may arrive. */
  searching: boolean;
  matchCount: number;
  /** Zero-based index of the current match, or undefined when none is current. */
  currentMatchIndex: number | undefined;
}
type SearchMatchVisitor = (match: MatchRange, index: number, line: number, startCharacter: number, endCharacter: number) => void;
interface SearchPosition {
  readonly line: number;
  readonly character: number;
}
/** What a replacement needs from a document to expand `$1`-style references. */
interface ReplacementDocument {
  positionAt(offset: number): SearchPosition;
  offsetAt(position: SearchPosition): number;
  getLineText(line: number): string;
}
/**
 * What a document must expose to be searched. Matching runs one line at a
 * time, so patterns that span a newline never match.
 */
interface SearchableDocument {
  readonly lineCount: number;
  /** Returns the line's text without its line ending. */
  getLineText(line: number): string;
  getLineStartOffset(line: number): number;
}
declare const MAX_SEARCH_MATCHES = 900001;
declare function searchDocument(document: SearchableDocument, searchParams: SearchParams, limit?: number, onMatch?: SearchMatchVisitor): MatchRange[];
/** Expands `$&`, `$1`, `$$`, etc. in a regex replace string using a match. */
declare function buildSearchReplacementText(document: ReplacementDocument, searchParams: SearchParams, matchStart: number, matchEnd: number): string;
//#endregion
export { CODE_VIEW_SEARCH_CARRIAGE_RETURN_LOOKAHEAD, CODE_VIEW_SEARCH_CLOCK_CHECK_CHARACTERS, CodeViewSearchDiff, CodeViewSearchDiffCursor, CodeViewSearchFile, CodeViewSearchItem, CodeViewSearchItemProgress, CodeViewSearchItemProvider, CodeViewSearchLineMetadata, CodeViewSearchLineSpan, CodeViewSearchLineVisitor, CodeViewSearchMatch, CodeViewSearchMatchEntry, CodeViewSearchPositionRange, CodeViewSearchScan, CodeViewSearchTextCursor, MAX_SEARCH_MATCHES, MatchRange, ReplacementDocument, SearchLineCuts, SearchMatchVisitor, SearchOptionDefaults, SearchPanelMode, SearchPanelState, SearchParams, SearchPosition, SearchableDocument, areCodeViewSearchMatchesEqual, areOptionalCodeViewSearchMatchesEqual, buildSearchReplacementText, compileSearchQuery, matchSearchLine, searchDocument };
//# sourceMappingURL=index.d.ts.map
import { CodeViewLayout, HighlighterTypes, HunkExpansionRegion, RenderRange, SmoothScrollSettings, ThemesType, VirtualFileMetrics } from "./types.js";
//#region src/constants.d.ts
declare const DIFFS_TAG_NAME: 'diffs-container';
declare const COMMIT_METADATA_SPLIT: RegExp;
declare const GIT_DIFF_FILE_BREAK_REGEX: RegExp;
declare const UNIFIED_DIFF_FILE_BREAK_REGEX: RegExp;
declare const FILE_CONTEXT_BLOB: RegExp;
declare const HUNK_HEADER: RegExp;
declare const SPLIT_WITH_NEWLINES: RegExp;
declare const FILENAME_HEADER_REGEX: RegExp;
declare const INDEX_LINE_METADATA: RegExp;
declare const MERGE_CONFLICT_START_MARKER_REGEX: RegExp;
declare const MERGE_CONFLICT_BASE_MARKER_REGEX: RegExp;
declare const MERGE_CONFLICT_SEPARATOR_MARKER_REGEX: RegExp;
declare const MERGE_CONFLICT_END_MARKER_REGEX: RegExp;
declare const HEADER_PREFIX_SLOT_ID = "header-prefix";
declare const HEADER_FILENAME_SUFFIX_SLOT_ID = "header-filename-suffix";
declare const HEADER_METADATA_SLOT_ID = "header-metadata";
declare const CUSTOM_HEADER_SLOT_ID = "header-custom";
declare const DEFAULT_THEMES: ThemesType;
declare const DEFAULT_HIGHLIGHTER: HighlighterTypes;
declare const THEME_CSS_ATTRIBUTE = "data-theme-css";
declare const UNSAFE_CSS_ATTRIBUTE = "data-unsafe-css";
declare const CORE_CSS_ATTRIBUTE = "data-core-css";
declare const DIFFS_SCROLLBAR_MEASURE_ATTRIBUTE = "data-diffs-scrollbar-measure";
declare const CODE_VIEW_HEADER_ATTRIBUTE = "data-diffs-code-view-header";
declare const CODE_VIEW_FOOTER_ATTRIBUTE = "data-diffs-code-view-footer";
declare const DIFFS_SCROLLBAR_GUTTER_MEASURED_PROPERTY = "--diffs-scrollbar-gutter-measured";
declare const DEFAULT_COLLAPSED_CONTEXT_THRESHOLD = 1;
declare const DEFAULT_TOKENIZE_MAX_LENGTH = 100000;
declare const DEFAULT_LOCALE = "en";
declare const DEFAULT_MESSAGES: {
  /**
   * Hunk separator text for a collapsed region with a known line count.
   * Receives `count`.
   */
  unmodifiedLines: string;
  /**
   * Hunk separator text for a collapsed region whose size is unknown, which
   * happens for partial diffs parsed from patches.
   */
  unknownUnmodifiedLines: string;
  /** Button that expands an entire collapsed region at once. */
  expandAll: string;
  expandLine: string;
  /** Marker shown after a final line that has no trailing newline. */
  noNewlineAtEndOfFile: string;
  /** Merge conflict button that keeps the current (ours) side. */
  acceptCurrentChange: string;
  /** Merge conflict button that keeps the incoming (theirs) side. */
  acceptIncomingChange: string;
  /** Merge conflict button that keeps both sides. */
  acceptBoth: string;
  /** Placeholder of the editor search input. */
  searchPlaceholder: string;
  /** Placeholder of the editor replace input. */
  replacePlaceholder: string;
  /** Search panel status when the query is empty or matches nothing. */
  noSearchResults: string;
  /** Search panel status while scanning without any completed matches yet. */
  searching: string;
  /** Search panel status when no match is selected. Receives `count`. */
  searchResultCount: string;
  /**
   * Search panel status for the selected match. Receives the 1-based `index`
   * and the `count` of matches.
   */
  searchResultPosition: string;
  /** Search option toggle for case-sensitive matching. */
  matchCase: string;
  /** Search option toggle for whole-word matching. */
  wholeWord: string;
  /** Search option toggle for regular-expression matching. */
  regularExpression: string;
  /** Button that replaces the selected match. */
  replaceMatch: string;
  /** Button that replaces every match. */
  replaceAllMatches: string;
  /** Button that selects the previous match. */
  previousMatch: string;
  /** Button that selects the next match. */
  nextMatch: string;
  /** Button that closes the search panel. */
  closeSearch: string;
  /** Button that shows or hides the replace row. */
  toggleReplace: string;
};
declare const DEFAULT_VIRTUAL_FILE_METRICS: VirtualFileMetrics;
declare const DEFAULT_CODE_VIEW_FILE_METRICS: VirtualFileMetrics;
declare const DEFAULT_CODE_VIEW_LAYOUT: CodeViewLayout;
declare const DEFAULT_SMOOTH_SCROLL_SETTINGS: SmoothScrollSettings;
declare const DEFAULT_EXPANDED_REGION: HunkExpansionRegion;
declare const DEFAULT_RENDER_RANGE: RenderRange;
declare const EMPTY_LINE_ANNOTATIONS: never[];
//#endregion
export { CODE_VIEW_FOOTER_ATTRIBUTE, CODE_VIEW_HEADER_ATTRIBUTE, COMMIT_METADATA_SPLIT, CORE_CSS_ATTRIBUTE, CUSTOM_HEADER_SLOT_ID, DEFAULT_CODE_VIEW_FILE_METRICS, DEFAULT_CODE_VIEW_LAYOUT, DEFAULT_COLLAPSED_CONTEXT_THRESHOLD, DEFAULT_EXPANDED_REGION, DEFAULT_HIGHLIGHTER, DEFAULT_LOCALE, DEFAULT_MESSAGES, DEFAULT_RENDER_RANGE, DEFAULT_SMOOTH_SCROLL_SETTINGS, DEFAULT_THEMES, DEFAULT_TOKENIZE_MAX_LENGTH, DEFAULT_VIRTUAL_FILE_METRICS, DIFFS_SCROLLBAR_GUTTER_MEASURED_PROPERTY, DIFFS_SCROLLBAR_MEASURE_ATTRIBUTE, DIFFS_TAG_NAME, EMPTY_LINE_ANNOTATIONS, FILENAME_HEADER_REGEX, FILE_CONTEXT_BLOB, GIT_DIFF_FILE_BREAK_REGEX, HEADER_FILENAME_SUFFIX_SLOT_ID, HEADER_METADATA_SLOT_ID, HEADER_PREFIX_SLOT_ID, HUNK_HEADER, INDEX_LINE_METADATA, MERGE_CONFLICT_BASE_MARKER_REGEX, MERGE_CONFLICT_END_MARKER_REGEX, MERGE_CONFLICT_SEPARATOR_MARKER_REGEX, MERGE_CONFLICT_START_MARKER_REGEX, SPLIT_WITH_NEWLINES, THEME_CSS_ATTRIBUTE, UNIFIED_DIFF_FILE_BREAK_REGEX, UNSAFE_CSS_ATTRIBUTE };
//# sourceMappingURL=constants.d.ts.map
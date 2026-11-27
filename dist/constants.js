//#region src/constants.ts
const DIFFS_TAG_NAME = "diffs-container";
const COMMIT_METADATA_SPLIT = /(?=^From [a-f0-9]+ .+$)/m;
const GIT_DIFF_FILE_BREAK_REGEX = /(?=^diff --git)/gm;
const UNIFIED_DIFF_FILE_BREAK_REGEX = /(?=^---\s+\S)/gm;
const FILE_CONTEXT_BLOB = /(?=^@@ )/gm;
const HUNK_HEADER = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@(?: (.*))?/m;
const SPLIT_WITH_NEWLINES = /(?<=\n)/;
const FILENAME_HEADER_REGEX = /^(---|\+\+\+)\s+([^\t\r\n]+)/;
const INDEX_LINE_METADATA = /^index ([0-9a-f]+)\.\.([0-9a-f]+)(?: (\d+))?$/i;
const MERGE_CONFLICT_START_MARKER_REGEX = /^<{7,}(?:\s.*)?$/;
const MERGE_CONFLICT_BASE_MARKER_REGEX = /^\|{7,}(?:\s.*)?$/;
const MERGE_CONFLICT_SEPARATOR_MARKER_REGEX = /^={7,}$/;
const MERGE_CONFLICT_END_MARKER_REGEX = /^>{7,}(?:\s.*)?$/;
const HEADER_PREFIX_SLOT_ID = "header-prefix";
const HEADER_FILENAME_SUFFIX_SLOT_ID = "header-filename-suffix";
const HEADER_METADATA_SLOT_ID = "header-metadata";
const CUSTOM_HEADER_SLOT_ID = "header-custom";
const DEFAULT_THEMES = {
	dark: "pierre-dark",
	light: "pierre-light"
};
const DEFAULT_HIGHLIGHTER = "shiki-js";
const THEME_CSS_ATTRIBUTE = "data-theme-css";
const UNSAFE_CSS_ATTRIBUTE = "data-unsafe-css";
const CORE_CSS_ATTRIBUTE = "data-core-css";
const DIFFS_SCROLLBAR_MEASURE_ATTRIBUTE = "data-diffs-scrollbar-measure";
const CODE_VIEW_HEADER_ATTRIBUTE = "data-diffs-code-view-header";
const CODE_VIEW_FOOTER_ATTRIBUTE = "data-diffs-code-view-footer";
const DIFFS_SCROLLBAR_GUTTER_MEASURED_PROPERTY = "--diffs-scrollbar-gutter-measured";
const DEFAULT_COLLAPSED_CONTEXT_THRESHOLD = 1;
const DEFAULT_TOKENIZE_MAX_LENGTH = 1e5;
const DEFAULT_LOCALE = "en";
const DEFAULT_MESSAGES = {
	/**
	* Hunk separator text for a collapsed region with a known line count.
	* Receives `count`.
	*/
	unmodifiedLines: "{count, plural, one {# unmodified line} other {# unmodified lines}}",
	/**
	* Hunk separator text for a collapsed region whose size is unknown, which
	* happens for partial diffs parsed from patches.
	*/
	unknownUnmodifiedLines: "More unchanged context may be available",
	/** Button that expands an entire collapsed region at once. */
	expandAll: "Expand all",
	expandLine: "Show full line",
	/** Marker shown after a final line that has no trailing newline. */
	noNewlineAtEndOfFile: "No newline at end of file",
	/** Merge conflict button that keeps the current (ours) side. */
	acceptCurrentChange: "Accept current change",
	/** Merge conflict button that keeps the incoming (theirs) side. */
	acceptIncomingChange: "Accept incoming change",
	/** Merge conflict button that keeps both sides. */
	acceptBoth: "Accept both",
	/** Placeholder of the editor search input. */
	searchPlaceholder: "Search",
	/** Placeholder of the editor replace input. */
	replacePlaceholder: "Replace",
	/** Search panel status when the query is empty or matches nothing. */
	noSearchResults: "0/0",
	/** Search panel status while scanning without any completed matches yet. */
	searching: "Searching…",
	/** Search panel status when no match is selected. Receives `count`. */
	searchResultCount: "{count, plural, one {# result} other {# results}}",
	/**
	* Search panel status for the selected match. Receives the 1-based `index`
	* and the `count` of matches.
	*/
	searchResultPosition: "{index}/{count}",
	/** Search option toggle for case-sensitive matching. */
	matchCase: "Match Case",
	/** Search option toggle for whole-word matching. */
	wholeWord: "Whole Word",
	/** Search option toggle for regular-expression matching. */
	regularExpression: "Regexp",
	/** Button that replaces the selected match. */
	replaceMatch: "Replace",
	/** Button that replaces every match. */
	replaceAllMatches: "Replace All",
	/** Button that selects the previous match. */
	previousMatch: "Previous",
	/** Button that selects the next match. */
	nextMatch: "Next",
	/** Button that closes the search panel. */
	closeSearch: "Close",
	/** Button that shows or hides the replace row. */
	toggleReplace: "Toggle Replace"
};
const DEFAULT_VIRTUAL_FILE_METRICS = {
	hunkLineCount: 50,
	lineHeight: 20,
	diffHeaderHeight: 44,
	spacing: 8
};
const DEFAULT_CODE_VIEW_FILE_METRICS = {
	...DEFAULT_VIRTUAL_FILE_METRICS,
	hunkLineCount: 1
};
const DEFAULT_CODE_VIEW_LAYOUT = {
	paddingTop: 8,
	paddingBottom: 8,
	gap: 8
};
const DEFAULT_SMOOTH_SCROLL_SETTINGS = {
	omega: .015,
	positionEpsilon: .5,
	velocityEpsilon: .05
};
const DEFAULT_EXPANDED_REGION = Object.freeze({
	fromStart: 0,
	fromEnd: 0
});
const DEFAULT_RENDER_RANGE = {
	startingLine: 0,
	totalLines: Infinity,
	bufferBefore: 0,
	bufferAfter: 0
};
const EMPTY_LINE_ANNOTATIONS = Object.freeze([]);
//#endregion
export { CODE_VIEW_FOOTER_ATTRIBUTE, CODE_VIEW_HEADER_ATTRIBUTE, COMMIT_METADATA_SPLIT, CORE_CSS_ATTRIBUTE, CUSTOM_HEADER_SLOT_ID, DEFAULT_CODE_VIEW_FILE_METRICS, DEFAULT_CODE_VIEW_LAYOUT, DEFAULT_COLLAPSED_CONTEXT_THRESHOLD, DEFAULT_EXPANDED_REGION, DEFAULT_HIGHLIGHTER, DEFAULT_LOCALE, DEFAULT_MESSAGES, DEFAULT_RENDER_RANGE, DEFAULT_SMOOTH_SCROLL_SETTINGS, DEFAULT_THEMES, DEFAULT_TOKENIZE_MAX_LENGTH, DEFAULT_VIRTUAL_FILE_METRICS, DIFFS_SCROLLBAR_GUTTER_MEASURED_PROPERTY, DIFFS_SCROLLBAR_MEASURE_ATTRIBUTE, DIFFS_TAG_NAME, EMPTY_LINE_ANNOTATIONS, FILENAME_HEADER_REGEX, FILE_CONTEXT_BLOB, GIT_DIFF_FILE_BREAK_REGEX, HEADER_FILENAME_SUFFIX_SLOT_ID, HEADER_METADATA_SLOT_ID, HEADER_PREFIX_SLOT_ID, HUNK_HEADER, INDEX_LINE_METADATA, MERGE_CONFLICT_BASE_MARKER_REGEX, MERGE_CONFLICT_END_MARKER_REGEX, MERGE_CONFLICT_SEPARATOR_MARKER_REGEX, MERGE_CONFLICT_START_MARKER_REGEX, SPLIT_WITH_NEWLINES, THEME_CSS_ATTRIBUTE, UNIFIED_DIFF_FILE_BREAK_REGEX, UNSAFE_CSS_ATTRIBUTE };

//# sourceMappingURL=constants.js.map
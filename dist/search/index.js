import { compileSearchQuery, matchSearchLine } from "./lineSearch.js";
import { CODE_VIEW_SEARCH_CARRIAGE_RETURN_LOOKAHEAD, CODE_VIEW_SEARCH_CLOCK_CHECK_CHARACTERS, CodeViewSearchDiffCursor, CodeViewSearchScan, CodeViewSearchTextCursor, areCodeViewSearchMatchesEqual, areOptionalCodeViewSearchMatchesEqual } from "./codeViewSearch.js";
//#region src/search/index.ts
const MAX_SEARCH_MATCHES = 900001;
function searchDocument(document, searchParams, limit = MAX_SEARCH_MATCHES, onMatch) {
	const pattern = compileSearchQuery(searchParams);
	if (pattern == null) return [];
	const out = [];
	const { wholeWord } = searchParams;
	let line = 0;
	let lineStart = 0;
	const visitMatch = (startCharacter, endCharacter) => {
		const range = [lineStart + startCharacter, lineStart + endCharacter];
		out.push(range);
		onMatch?.(range, out.length - 1, line, startCharacter, endCharacter);
		return out.length >= limit;
	};
	for (; line < document.lineCount; line++) {
		const lineText = document.getLineText(line);
		lineStart = document.getLineStartOffset(line);
		if (matchSearchLine(pattern, lineText, wholeWord, visitMatch)) break;
	}
	return out;
}
/** Expands `$&`, `$1`, `$$`, etc. in a regex replace string using a match. */
function buildSearchReplacementText(document, searchParams, matchStart, matchEnd) {
	if (!searchParams.regex) return searchParams.replaceText;
	const position = document.positionAt(matchStart);
	const lineText = document.getLineText(position.line);
	const relStart = matchStart - document.offsetAt({
		line: position.line,
		character: 0
	});
	const pattern = compileSearchQuery(searchParams);
	if (pattern == null) return searchParams.replaceText;
	pattern.lastIndex = relStart;
	const match = pattern.exec(lineText);
	if (match == null || match.index !== relStart || match[0].length !== matchEnd - matchStart) return searchParams.replaceText;
	return expandReplaceString(searchParams.replaceText, match);
}
function expandReplaceString(replacement, match) {
	return replacement.replace(/\$([$&]|\d+)/g, (_token, group) => {
		if (group === "$") return "$";
		if (group === "&") return match[0] ?? "";
		return match[Number(group)] ?? "";
	});
}
//#endregion
export { CODE_VIEW_SEARCH_CARRIAGE_RETURN_LOOKAHEAD, CODE_VIEW_SEARCH_CLOCK_CHECK_CHARACTERS, CodeViewSearchDiffCursor, CodeViewSearchScan, CodeViewSearchTextCursor, MAX_SEARCH_MATCHES, areCodeViewSearchMatchesEqual, areOptionalCodeViewSearchMatchesEqual, buildSearchReplacementText, compileSearchQuery, matchSearchLine, searchDocument };

//# sourceMappingURL=index.js.map
//#region src/search/lineSearch.ts
const WORD_SEPARATORS = "`~!@#$%^&*()-=+[{]}\\|;:'\",.<>/?";
function compileSearchQuery(searchParams) {
	if (searchParams.text.length === 0 || isNewlineSpanningSearch(searchParams.text, searchParams.regex)) return;
	try {
		return compileSearchRegExp(searchParams.text, searchParams.regex, searchParams.caseSensitive);
	} catch {
		return;
	}
}
function matchSearchLine(pattern, lineText, wholeWord, visitMatch) {
	pattern.lastIndex = 0;
	let match;
	while ((match = pattern.exec(lineText)) != null) {
		const start = match.index;
		const length = match[0].length;
		if (length === 0) {
			pattern.lastIndex = advancePastEmptyMatch(lineText, start);
			continue;
		}
		const end = start + length;
		if ((!wholeWord || isWholeWordInLine(lineText, start, end)) && visitMatch(start, end)) return true;
		if (start === pattern.lastIndex) pattern.lastIndex = advancePastEmptyMatch(lineText, start);
	}
	return false;
}
function isNewlineSpanningSearch(text, isRegex) {
	return text.includes("\n") || text.includes("\r") || isRegex && /\\[nr]/.test(text.replaceAll("\\\\", ""));
}
function escapeRegExp(text) {
	return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function compileSearchRegExp(source, isRegex, caseSensitive) {
	const body = isRegex ? source : escapeRegExp(source);
	return new RegExp(body, `g${caseSensitive ? "" : "i"}${isRegex ? "m" : ""}`);
}
function isWordSeparatorCharCode(charCode) {
	if (charCode <= 32 || charCode === 127) return true;
	const ch = String.fromCharCode(charCode);
	return WORD_SEPARATORS.includes(ch);
}
function isWholeWordInLine(text, start, end) {
	return (start === 0 || isWordSeparatorCharCode(text.charCodeAt(start - 1))) && (end === text.length || isWordSeparatorCharCode(text.charCodeAt(end)));
}
function advancePastEmptyMatch(text, index) {
	if (index + 1 < text.length) {
		const first = text.charCodeAt(index);
		const second = text.charCodeAt(index + 1);
		if (first >= 55296 && first <= 56319 && second >= 56320 && second <= 57343) return index + 2;
	}
	return index + 1;
}
//#endregion
export { compileSearchQuery, matchSearchLine };

//# sourceMappingURL=lineSearch.js.map
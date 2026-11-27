//#region src/utils/endsWithNewline.ts
function endsWithNewline(diff, side) {
	const lines = side === "additions" ? diff.additionLines : diff.deletionLines;
	if (lines.length === 0) return false;
	if (diff.isPartial) {
		const lastHunk = diff.hunks.at(-1);
		return lastHunk != null && !(side === "additions" ? lastHunk.noEOFCRAdditions : lastHunk.noEOFCRDeletions);
	}
	return lines.at(-1)?.endsWith("\n") === true;
}
//#endregion
export { endsWithNewline };

//# sourceMappingURL=endsWithNewline.js.map
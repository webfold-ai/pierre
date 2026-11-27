//#region src/search/revealMatchHorizontally.ts
function revealMatchHorizontally(range) {
	const code = range.startContainer.parentElement?.closest("[data-code]");
	if (code == null || code.clientWidth === 0) return false;
	if (code.scrollWidth <= code.clientWidth) return true;
	const rect = range.getBoundingClientRect();
	const viewport = code.getBoundingClientRect();
	const gutter = code.querySelector(":scope > [data-gutter]");
	const left = Math.max(viewport.left + code.clientLeft, gutter?.getBoundingClientRect().right ?? viewport.left);
	const right = viewport.left + code.clientLeft + code.clientWidth;
	const delta = rect.left < left || rect.width > right - left ? rect.left - left : Math.max(0, rect.right - right);
	code.scrollTo({
		left: code.scrollLeft + delta,
		behavior: "instant"
	});
	return true;
}
//#endregion
export { revealMatchHorizontally };

//# sourceMappingURL=revealMatchHorizontally.js.map
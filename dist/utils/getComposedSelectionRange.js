//#region src/utils/getComposedSelectionRange.ts
let composedRangesTakeOptions;
function getComposedRange(selection, shadowRoot) {
	if (composedRangesTakeOptions == null) try {
		selection.getComposedRanges({ shadowRoots: [shadowRoot] });
		composedRangesTakeOptions = true;
	} catch {
		composedRangesTakeOptions = false;
	}
	if (composedRangesTakeOptions) return selection.getComposedRanges({ shadowRoots: [shadowRoot] })?.[0];
	return selection.getComposedRanges(shadowRoot)?.[0];
}
function getShadowRootRange(shadowRoot) {
	const selection = shadowRoot.getSelection?.();
	if (selection == null || selection.rangeCount === 0) return;
	const range = selection.getRangeAt(0);
	return {
		collapsed: range.collapsed,
		startContainer: range.startContainer,
		startOffset: range.startOffset,
		endContainer: range.endContainer,
		endOffset: range.endOffset
	};
}
function getComposedSelectionRange(shadowRoot) {
	const selection = document.getSelection();
	if (selection == null) return;
	return typeof selection.getComposedRanges === "function" ? getComposedRange(selection, shadowRoot) : getShadowRootRange(shadowRoot);
}
//#endregion
export { getComposedSelectionRange };

//# sourceMappingURL=getComposedSelectionRange.js.map
import { areThemesEqual } from "./areThemesEqual.js";
//#region src/utils/areDiffRenderOptionsEqual.ts
function areDiffRenderOptionsEqual(optionsA, optionsB) {
	return areThemesEqual(optionsA.theme, optionsB.theme) && (optionsA.preferredDiffLib ?? "jsdiff") === (optionsB.preferredDiffLib ?? "jsdiff") && optionsA.useTokenTransformer === optionsB.useTokenTransformer && optionsA.tokenizeMaxLineLength === optionsB.tokenizeMaxLineLength && optionsA.lineDiffType === optionsB.lineDiffType && optionsA.maxLineDiffLength === optionsB.maxLineDiffLength;
}
//#endregion
export { areDiffRenderOptionsEqual };

//# sourceMappingURL=areDiffRenderOptionsEqual.js.map
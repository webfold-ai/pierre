import { CORE_CSS_ATTRIBUTE, THEME_CSS_ATTRIBUTE, UNSAFE_CSS_ATTRIBUTE } from "../constants.js";
import { wrapCoreCSS, wrapUnsafeCSS } from "./cssWrappers.js";
import { createHastElement, createTextNodeElement } from "./hast_utils.js";
//#region src/utils/createStyleElement.ts
/** The base stylesheet server-rendered markup carries until it hydrates. */
function createCoreStyleElement() {
	return createHastElement({
		tagName: "style",
		children: [createTextNodeElement(wrapCoreCSS())],
		properties: { [CORE_CSS_ATTRIBUTE]: "" }
	});
}
function createStyleElement(unsafeCSS) {
	return createHastElement({
		tagName: "style",
		children: [createTextNodeElement(wrapUnsafeCSS(unsafeCSS))],
		properties: { [UNSAFE_CSS_ATTRIBUTE]: "" }
	});
}
function createThemeStyleElement(content) {
	return createHastElement({
		tagName: "style",
		children: [createTextNodeElement(content)],
		properties: { [THEME_CSS_ATTRIBUTE]: "" }
	});
}
//#endregion
export { createCoreStyleElement, createStyleElement, createThemeStyleElement };

//# sourceMappingURL=createStyleElement.js.map
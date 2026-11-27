import { i18n } from "../i18n/I18n.js";
import { createHastElement, createTextNodeElement } from "./hast_utils.js";
//#region src/utils/createNoNewlineElement.ts
function createNoNewlineElement(type) {
	return createHastElement({
		tagName: "div",
		children: [createHastElement({
			tagName: "span",
			children: [createTextNodeElement(i18n.t("noNewlineAtEndOfFile"))]
		})],
		properties: {
			"data-no-newline": "",
			"data-line-type": type,
			"data-column-content": ""
		}
	});
}
//#endregion
export { createNoNewlineElement };

//# sourceMappingURL=createNoNewlineElement.js.map
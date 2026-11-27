import { SVGSpriteSheet } from "../sprite.js";
//#region src/utils/createSVGSpriteElement.ts
const parsedSpriteSheets = /* @__PURE__ */ new WeakMap();
function createSVGSpriteElement() {
	let parsed = parsedSpriteSheets.get(document);
	if (parsed == null) {
		const container = document.createElement("div");
		container.innerHTML = SVGSpriteSheet;
		const firstChild = container.firstChild;
		if (!(firstChild instanceof SVGElement)) return;
		firstChild.remove();
		parsed = firstChild;
		parsedSpriteSheets.set(document, parsed);
	}
	return parsed.cloneNode(true);
}
/**
* Prerendered HTML carries only the icons its own markup uses (see
* ssr/renderHTML.ts). Hydration swaps such a partial sheet for the full one,
* so icons the component renders later (separators, gutter utility, header
* changes) still resolve.
*/
function hydrateSVGSpriteElement(element) {
	if (!element.hasAttribute("data-icon-sprite-partial")) return element;
	const full = createSVGSpriteElement();
	if (full == null) return element;
	element.replaceWith(full);
	return full;
}
//#endregion
export { createSVGSpriteElement, hydrateSVGSpriteElement };

//# sourceMappingURL=createSVGSpriteElement.js.map
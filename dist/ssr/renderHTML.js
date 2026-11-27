import { hastToHtml } from "../utils/hastToHtml.js";
import { SVGSpriteSheet } from "../sprite.js";
//#region src/ssr/renderHTML.ts
const SPRITE_SYMBOLS = new Map(Array.from(SVGSpriteSheet.matchAll(/<symbol id="([^"]+)"[\s\S]*?<\/symbol>/g), ([symbol, id]) => [id, symbol]));
function renderHTML(children) {
	const html = hastToHtml(children);
	return `${getSpriteSheetForHTML(html)}${html}`;
}
/**
* Builds a sprite sheet with only the icons this markup references, instead of
* every icon (about 16 KB): prerendered HTML repeats the sheet in each file's
* shadow root. It is marked partial so hydration swaps in the full sheet
* (hydrateSVGSpriteElement).
*/
function getSpriteSheetForHTML(html) {
	let symbols = "";
	const used = /* @__PURE__ */ new Set();
	for (const [, id] of html.matchAll(/href="#([^"]+)"/g)) {
		const symbol = SPRITE_SYMBOLS.get(id);
		if (symbol != null && !used.has(id)) {
			used.add(id);
			symbols += symbol;
		}
	}
	return `<svg data-icon-sprite data-icon-sprite-partial aria-hidden="true" width="0" height="0">${symbols}</svg>`;
}
//#endregion
export { renderHTML };

//# sourceMappingURL=renderHTML.js.map
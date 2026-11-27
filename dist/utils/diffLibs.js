import { createTwoFilesPatch, diffChars, diffWordsWithSpace } from "@pierre/patches";
import { createTwoFilesPatch as createTwoFilesPatch$1, diffChars as diffChars$1, diffWordsWithSpace as diffWordsWithSpace$1 } from "diff";
//#region src/utils/diffLibs.ts
const diffLibs = {
	jsdiff: {
		createTwoFilesPatch: createTwoFilesPatch$1,
		diffChars: diffChars$1,
		diffWordsWithSpace: diffWordsWithSpace$1
	},
	"@pierre/patches": {
		createTwoFilesPatch,
		diffChars,
		diffWordsWithSpace
	}
};
let patchesWork;
/**
* Pick jsdiff when `@pierre/patches` cannot load, so a page that blocks
* WebAssembly fails and logs once, not on every diff.
* WARNING: do not use `canUseWASM` here. Cloudflare Workers block its runtime
* compile, but this package loads a precompiled module there and works.
*/
function resolveDiffLib(preferred) {
	if (preferred === "jsdiff") return preferred;
	if (patchesWork === void 0) try {
		diffChars("", "");
		patchesWork = true;
	} catch (error) {
		console.error(error);
		patchesWork = false;
	}
	return patchesWork ? preferred : "jsdiff";
}
//#endregion
export { diffLibs, resolveDiffLib };

//# sourceMappingURL=diffLibs.js.map
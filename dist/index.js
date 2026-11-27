import { createPatch, createTwoFilesPatch, diffChars, diffLines, diffWordsWithSpace, init, setMemoryLimit } from "./core.js";
import wasmBase64 from "./patch.wasm.mjs";
//#region lib/index.ts
init(() => {
	const s = atob(wasmBase64);
	const bytes = new Uint8Array(s.length);
	for (let i = 0; i < s.length; i++) bytes[i] = s.charCodeAt(i);
	return new WebAssembly.Module(bytes);
});
//#endregion
export { createPatch, createTwoFilesPatch, diffChars, diffLines, diffWordsWithSpace, setMemoryLimit };

//# sourceMappingURL=index.js.map
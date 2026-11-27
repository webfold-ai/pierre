import { createPatch, createTwoFilesPatch, diffChars, diffLines, diffWordsWithSpace, init, setMemoryLimit } from "./core.js";
import wasmModule from "./patch.wasm";
//#region lib/workerd.ts
init(() => wasmModule);
//#endregion
export { createPatch, createTwoFilesPatch, diffChars, diffLines, diffWordsWithSpace, setMemoryLimit };

//# sourceMappingURL=workerd.js.map
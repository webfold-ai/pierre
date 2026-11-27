import { createWords } from "./core.js";
import wasmBytes from "./words.wasm.mjs";
//#region lib/index.ts
const { init, renderToHtml, renderToAnsi, createHtmlSession, canUseWASM } = createWords(() => new WebAssembly.Module(wasmBytes));
//#endregion
export { canUseWASM, createHtmlSession, init, renderToAnsi, renderToHtml };

//# sourceMappingURL=index.js.map
import { createWords } from "./core.js";
import wasmBytes from "./words-no-math.wasm.mjs";
//#region lib/no-math.ts
const { init, renderToHtml, renderToAnsi, createHtmlSession, canUseWASM } = createWords(() => new WebAssembly.Module(wasmBytes));
//#endregion
export { canUseWASM, createHtmlSession, init, renderToAnsi, renderToHtml };

//# sourceMappingURL=no-math.js.map
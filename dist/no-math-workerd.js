import { createWords } from "./core.js";
import wasmModule from "./words-no-math.wasm";
//#region lib/no-math-workerd.ts
const { init, renderToHtml, renderToAnsi, createHtmlSession, canUseWASM } = createWords(() => wasmModule);
//#endregion
export { canUseWASM, createHtmlSession, init, renderToAnsi, renderToHtml };

//# sourceMappingURL=no-math-workerd.js.map
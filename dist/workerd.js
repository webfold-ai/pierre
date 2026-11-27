import { createWords } from "./core.js";
import wasmModule from "./words.wasm";
//#region lib/workerd.ts
const { init, renderToHtml, renderToAnsi, createHtmlSession, canUseWASM } = createWords(() => wasmModule);
//#endregion
export { canUseWASM, createHtmlSession, init, renderToAnsi, renderToHtml };

//# sourceMappingURL=workerd.js.map
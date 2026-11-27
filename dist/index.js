import { StreamTokenizer, codeToHtml, codeToTokens, createHighlighter, init, initLazy, isRegisteredLanguage, isSupportedLanguage, registerLanguages, wasmBytes } from "./highlighter.js";
import { LiveTokenizer, tokenNames } from "./live.js";
import "./core.js";
import wasm from "./highlights.wasm.mjs";
export * from "./themes.js";
//#region lib/index.ts
initLazy(() => new WebAssembly.Module(wasmBytes(wasm)));
//#endregion
export { LiveTokenizer, StreamTokenizer, codeToHtml, codeToTokens, createHighlighter, init, isRegisteredLanguage, isSupportedLanguage, registerLanguages, tokenNames };

//# sourceMappingURL=index.js.map
import { StreamTokenizer, codeToHtml, codeToTokens, createHighlighter, init, initEmitter, isRegisteredLanguage, isSupportedLanguage, registerLanguages } from "./highlighter.js";
import { LiveTokenizer, tokenNames } from "./live.js";
import "./core.js";
import emitterModule from "./emitter.wasm";
import wasmModule from "./highlights.wasm";
export * from "./themes.js";
//#region lib/workerd.ts
init(wasmModule);
initEmitter(emitterModule);
//#endregion
export { LiveTokenizer, StreamTokenizer, codeToHtml, codeToTokens, createHighlighter, init, isRegisteredLanguage, isSupportedLanguage, registerLanguages, tokenNames };

//# sourceMappingURL=workerd.js.map
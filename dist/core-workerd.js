import { StreamTokenizer, codeToHtml, codeToTokens, createHighlighter, init, initEmitter, isRegisteredLanguage, isSupportedLanguage, registerLanguages } from "./highlighter.js";
import { LiveTokenizer, tokenNames } from "./live.js";
import "./core.js";
import emitterModule from "./emitter.wasm";
//#region lib/core-workerd.ts
initEmitter(emitterModule);
//#endregion
export { LiveTokenizer, StreamTokenizer, codeToHtml, codeToTokens, createHighlighter, init, isRegisteredLanguage, isSupportedLanguage, registerLanguages, tokenNames };

//# sourceMappingURL=core-workerd.js.map
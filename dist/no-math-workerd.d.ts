import { AnsiOptions, Frontmatter, HtmlSessionOptions, HtmlUpdate, RenderOptions } from "./types.js";
import { HtmlSession, Input, RenderToHtml, Renderer } from "./core.js";
//#region lib/no-math-workerd.d.ts
declare const init: (module: WebAssembly.Module) => Renderer, renderToHtml: RenderToHtml, renderToAnsi: (input: Input, options?: AnsiOptions) => Uint8Array, createHtmlSession: () => HtmlSession, canUseWASM: () => boolean;
//#endregion
export { type AnsiOptions, type Frontmatter, type HtmlSessionOptions, type HtmlUpdate, type RenderOptions, canUseWASM, createHtmlSession, init, renderToAnsi, renderToHtml };
//# sourceMappingURL=no-math-workerd.d.ts.map
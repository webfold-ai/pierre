import { Element } from "../node_modules/.pnpm/@types_hast@3.0.4/node_modules/@types/hast/index.js";
//#region src/utils/createStyleElement.d.ts
/** The base stylesheet server-rendered markup carries until it hydrates. */
declare function createCoreStyleElement(): Element;
declare function createStyleElement(unsafeCSS: string): Element;
declare function createThemeStyleElement(content: string): Element;
//#endregion
export { createCoreStyleElement, createStyleElement, createThemeStyleElement };
//# sourceMappingURL=createStyleElement.d.ts.map
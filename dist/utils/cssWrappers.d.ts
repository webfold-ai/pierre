import { ThemeTypes } from "../types.js";
//#region src/utils/cssWrappers.d.ts
/** The package's base stylesheet, under the layer order it relies on. */
declare function wrapCoreCSS(): string;
declare function wrapUnsafeCSS(unsafeCSS: string): string;
declare function wrapThemeCSS(themeCSS: string, themeType?: ThemeTypes, scrollbarGutter?: number): string;
declare function patchScrollbarGutterSize(themeCSS: string, scrollbarGutter: number | undefined): string;
//#endregion
export { patchScrollbarGutterSize, wrapCoreCSS, wrapThemeCSS, wrapUnsafeCSS };
//# sourceMappingURL=cssWrappers.d.ts.map
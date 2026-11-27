import { CreatePatchOptions, DiffLib } from "../types.js";
import { diffChars, diffWordsWithSpace } from "@pierre/patches";
//#region src/utils/diffLibs.d.ts
declare const diffLibs: Record<DiffLib, {
  createTwoFilesPatch(oldFileName: string, newFileName: string, oldStr: string, newStr: string, oldHeader?: string, newHeader?: string, options?: CreatePatchOptions): string;
  diffChars: typeof diffChars;
  diffWordsWithSpace: typeof diffWordsWithSpace;
}>;
/**
 * Pick jsdiff when `@pierre/patches` cannot load, so a page that blocks
 * WebAssembly fails and logs once, not on every diff.
 * WARNING: do not use `canUseWASM` here. Cloudflare Workers block its runtime
 * compile, but this package loads a precompiled module there and works.
 */
declare function resolveDiffLib(preferred: DiffLib): DiffLib;
//#endregion
export { diffLibs, resolveDiffLib };
//# sourceMappingURL=diffLibs.d.ts.map
import { n as escapeHtml, t as defaultUrlTransform } from "./utils-CuU0rIhc.js";
import { a as CodeOptions, c as HtmlIsland, d as IslandPending, f as MermaidPlugin, i as CodeHighlighterSession, l as HtmlOptions, n as CodeHighlightUpdate, o as Components, p as PluginConfig, r as CodeHighlighterPlugin, s as ControlsConfig, t as AnimateOptions, u as IslandData } from "./types-BP3TAJSp.js";
import { HtmlUpdate } from "@pierre/words";
//#region html/render.d.ts
/** Changed lines of the open code fence, for the DOM renderer. */
interface CodeHtmlUpdate extends Omit<CodeHighlightUpdate, 'fullHtml'> {
  /** Changes when the markup around the fence lines changes. */
  key: number;
  lastLine: number;
  /** Lines shown in the gutter, or undefined without line numbers. */
  numbers: number | undefined;
  /** The whole pending HTML, built on first read. */
  readonly pending: string;
}
type RenderedHtmlUpdate = HtmlUpdate & {
  code?: CodeHtmlUpdate;
};
/** Format session output with HTML options. Keeps at most one live highlighter. */
declare function createHtmlRenderer(options?: HtmlOptions): {
  /** Change options. A reset discards completed output and reformats it. */
  configure(next: HtmlOptions, reset?: boolean): void;
  render(source: string, incomplete: boolean, active?: boolean): RenderedHtmlUpdate;
  dispose: () => void;
};
//#endregion
//#region html/islands.d.ts
interface MountedIsland {
  key: string;
  name: string;
  data: IslandData;
  content: HTMLElement;
  fallback: HTMLElement;
  source: string;
}
//#endregion
//#region html/dom.d.ts
/** Render Markdown into `root`, and patch its DOM nodes on each update. */
declare function createDomRenderer(root: HTMLElement, options?: HtmlOptions, formatter?: {
  configure(next: HtmlOptions, reset?: boolean): void;
  render(source: string, incomplete: boolean, active?: boolean): any;
  dispose: () => void;
}): {
  getIslands: () => readonly MountedIsland[];
  connect(): void;
  disconnect(): void;
  /**
   * Reformat completed output only when an option value changes, so inline
   * option objects stay cheap. New hook and `urlTransform` functions apply to
   * later output. A changed set of hook names reformats everything. Plugins
   * compare by their parts, because a wrapper object is often written inline.
   */
  configure(next: HtmlOptions): void;
  update(source: string, incomplete: boolean, active?: boolean, animated?: boolean | AnimateOptions, shape?: 'block' | 'circle'): void;
};
//#endregion
export { type AnimateOptions, type CodeHighlightUpdate, type CodeHighlighterPlugin, type CodeHighlighterSession, type CodeOptions, type Components, type ControlsConfig, type HtmlIsland, type HtmlOptions, type IslandData, type IslandPending, type MermaidPlugin, type PluginConfig, createDomRenderer, createHtmlRenderer, defaultUrlTransform, escapeHtml };
//# sourceMappingURL=html.d.ts.map
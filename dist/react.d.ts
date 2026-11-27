import { t as defaultUrlTransform } from "./utils-CuU0rIhc.js";
import { a as CodeOptions, c as HtmlIsland, d as IslandPending, f as MermaidPlugin, i as CodeHighlighterSession, l as HtmlOptions, n as CodeHighlightUpdate, o as Components, p as PluginConfig, r as CodeHighlighterPlugin, s as ControlsConfig, t as AnimateOptions, u as IslandData } from "./types-BP3TAJSp.js";
import { HTMLAttributes, ReactElement, ReactNode } from "react";
//#region react/react.d.ts
interface ReactiveIsland extends Pick<HtmlIsland, 'fallback' | 'pending' | 'inline'> {
  /** Return a React element, or null to keep the original source. */
  render(data: IslandData): ReactElement | null;
}
type ReactiveIslands = Readonly<Record<string, ReactiveIsland>>;
interface MarkdownProps extends Omit<HTMLAttributes<HTMLDivElement>, 'children'>, Omit<HtmlOptions, 'islands'> {
  /** Components available to island-NAME fences and opted-in inline directives. */
  islands?: ReactiveIslands;
  children?: string;
  mode?: 'streaming' | 'static';
  isAnimating?: boolean;
  animated?: boolean | AnimateOptions;
  parseIncompleteMarkdown?: boolean;
  caret?: 'block' | 'circle';
  onAnimationStart?: () => void;
  onAnimationEnd?: () => void;
}
/** React owns the container, and `createDomRenderer` owns its content. */
declare function Markdown({ children, mode, isAnimating, animated, parseIncompleteMarkdown, components, plugins, islands, cjk, math, allowedHtml, escapeHtml, controls, lineNumbers, caret, allowedElements, disallowedElements, unwrapDisallowed, urlTransform, idPrefix, onAnimationStart, onAnimationEnd, ...props }: MarkdownProps): ReactNode;
//#endregion
export { type AnimateOptions, type CodeHighlightUpdate, type CodeHighlighterPlugin, type CodeHighlighterSession, type CodeOptions, type Components, type ControlsConfig, type HtmlIsland, type HtmlOptions, type IslandData, type IslandPending, Markdown, MarkdownProps, type MermaidPlugin, type PluginConfig, ReactiveIsland, ReactiveIslands, defaultUrlTransform };
//# sourceMappingURL=react.d.ts.map
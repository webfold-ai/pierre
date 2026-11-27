import { MatchRange, SearchOptionDefaults, SearchPanelMode, SearchPanelState, SearchParams } from "./index.js";
//#region src/search/SearchPanelWidget.d.ts
interface SearchResult<TMatch> {
  matches: TMatch[];
  preferredMatch?: TMatch;
  searching?: boolean;
}
interface SearchPanelReplaceHandlers<TMatch> {
  replaceMatch: (match: TMatch, searchParams: SearchParams) => TMatch | undefined;
  replaceAll: (matches: TMatch[], searchParams: SearchParams) => void;
}
interface SearchPanelOptions<TMatch = MatchRange> {
  containerElement: HTMLElement;
  themeCSS?: string;
  unsafeCSS?: string;
  defaultQuery: string;
  defaults?: SearchOptionDefaults;
  mode?: SearchPanelMode;
  search: (searchParams: SearchParams) => SearchResult<TMatch>;
  scrollToMatch: (nextMatch: TMatch, retainFocus: boolean) => void;
  /**
   * Whether the current match was made current without being scrolled to. The
   * next find step then goes to it instead of the match after it.
   */
  currentMatchNeedsReveal?: () => boolean;
  replace?: SearchPanelReplaceHandlers<TMatch>;
  /** Query text or matching options changed; excludes replacement text and refreshes. */
  onQueryChange?: () => void;
  /**
   * Called with every new list of matches. Returns the index of the current
   * match in that list, or undefined when no match is current.
   */
  onUpdate: (result: SearchResult<TMatch>, options?: {
    skipNavigation?: boolean;
  }) => number | undefined;
  /** Reports the panel state on open and after every change. */
  onStateChange?: (state: SearchPanelState) => void;
  /**
   * Called before each find step, so the host can bring its matches up to
   * date first.
   */
  onBeforeNavigate?: () => void;
  onClose: () => void;
}
declare class SearchPanelWidget<TMatch = MatchRange> {
  #private;
  constructor(options: SearchPanelOptions<TMatch>);
  mount(): void;
  getHostElement(): HTMLDivElement;
  getBounds(): DOMRect;
  setThemeCSS(themeCSS: string | undefined): void;
  setUnsafeCSS(css: string | undefined): void;
  hasQuery(): boolean;
  hasReplaceHandlers(): boolean;
  focus(): void;
  navigate(findPrevious: boolean): void;
  setQuery(text: string): void;
  updateMatches(options?: {
    skipNavigation?: boolean;
  }): void;
  setMode(mode: SearchPanelMode): void;
  setReplaceHandlers(handlers: SearchPanelReplaceHandlers<TMatch> | undefined): void;
  close(): void;
  cleanup(): void;
}
//#endregion
export { SearchPanelOptions, SearchPanelReplaceHandlers, SearchPanelWidget, SearchResult };
//# sourceMappingURL=SearchPanelWidget.d.ts.map
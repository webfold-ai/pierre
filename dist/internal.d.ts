//#region lib/internal.d.ts
/**
 * Asks a session for the final markup of the HTML renderer instead of plain
 * HTML. `flags` are the `$Fmt` bits of `src/html.wat`. `idPrefix` is escaped.
 */
interface HtmlFormat {
  flags: number;
  idPrefix: string;
  /** Length-prefixed ASCII names of enabled inline islands. */
  inlineNames?: string;
}
//#endregion
export { HtmlFormat };
//# sourceMappingURL=internal.d.ts.map
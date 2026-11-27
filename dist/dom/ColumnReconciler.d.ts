import { RowKey, RowSpec } from "../layout/RowSpec.js";
//#region src/dom/ColumnReconciler.d.ts
interface ReconcileResult {
  /** Keys of rows that were inserted or whose cells were rewritten. */
  changed: Set<RowKey>;
  /**
   * True when a row was created or rebuilt from scratch. Such a row has lost
   * any attributes set on it outside the reconciler, like the selection
   * marks, and they need to be applied again.
   */
  attributesReset: boolean;
  /**
   * True when a row's gutter cell was rewritten. Anything mounted inside a
   * gutter cell from outside the reconciler, like the gutter utility, is
   * gone from it.
   */
  gutterRewritten: boolean;
}
/**
 * Keeps a code column's gutter and content children in step with a list of
 * row specs, by key. The first paint writes one string per column. After
 * that, a reconcile walks the specs once against the children: rows whose
 * key is gone are removed, missing rows are inserted (contiguous runs as one
 * string), rows that moved are moved, and rows whose spec changed have their
 * attributes and children rewritten. A row whose gutter and content cells
 * are the same objects as last time is not touched, so the layout's
 * memoization decides the cost. A change that moved no row skips the walk
 * and patches the rows it touched by key.
 */
declare class ColumnReconciler {
  #private;
  constructor(gutter: HTMLElement, content: HTMLElement);
  /** Writes every row with one string per column. */
  replaceAll(specs: readonly RowSpec[]): void;
  /**
   * Takes the rows already in the columns, such as server-rendered markup,
   * as the rows for `specs`, matched by position. Their contents are not
   * trusted, so the next reconcile rewrites them. Returns false, and changes
   * nothing, when the row counts do not match.
   */
  adopt(specs: readonly RowSpec[]): boolean;
  /** The elements of the row with this key, if it is on screen. */
  elementFor(key: RowKey): {
    gutter: HTMLElement;
    content: HTMLElement;
  } | undefined;
  /**
   * Removes the rows whose keys are not in `specs`, ahead of a reconcile with
   * the same specs. Called for every column before any column takes new rows,
   * so the columns of a split view shrink together and the tree is at its
   * smallest while the new rows parse.
   */
  removeStale(specs: readonly RowSpec[]): void;
  /**
   * Brings the columns in step with `specs`. When `patched` is given, those
   * are the only rows that differ from the last reconcile: their cells are
   * rewritten by key and the columns are not walked. Columns without rows
   * yet are written whole either way.
   */
  reconcile(specs: readonly RowSpec[], patched?: readonly RowSpec[]): ReconcileResult;
}
//#endregion
export { ColumnReconciler, ReconcileResult };
//# sourceMappingURL=ColumnReconciler.d.ts.map
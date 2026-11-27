//#region src/dom/CodeColumns.d.ts
/**
 * The code columns a component renders, by role, and their horizontal scroll
 * offsets. The offsets are kept from the columns' scroll events, so reading
 * them never touches the DOM. The columns scroll together, but a narrower
 * column clamps lower, so the widest one's offset is the component's.
 */
declare class CodeColumns<Role extends string> {
  #private;
  get(role: Role): HTMLElement | undefined;
  /**
   * Installs a role's column, moving the scroll listener from the column it
   * replaces. A column already on screen is read once; a new one starts at
   * zero.
   */
  set(role: Role, column: HTMLElement | undefined): void;
  /** Forgets every column and stops listening to it. */
  cleanUp(): void;
  /** The widest column's horizontal scroll offset. */
  get scrollLeft(): number;
  /**
   * Scrolls every column to `position` and keeps where each one landed: a
   * column clamps a position past its content, and no scroll event follows
   * when it did not move.
   */
  setScrollLeft(position: number): void;
}
//#endregion
export { CodeColumns };
//# sourceMappingURL=CodeColumns.d.ts.map
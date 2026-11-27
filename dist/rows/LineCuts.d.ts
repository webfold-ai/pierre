import { Element } from "../node_modules/.pnpm/@types_hast@3.0.4/node_modules/@types/hast/index.js";
import { AnnotationSide } from "../types.js";
import { DiffModel } from "../model/DiffModel.js";
import { FileModel } from "../model/FileModel.js";
//#region src/rows/LineCuts.d.ts
interface LineExpansion {
  additionLineNumber?: number;
  deletionLineNumber?: number;
}
declare function cutLineLength(text: string, limit: number): number | undefined;
declare class LineCuts {
  #private;
  get expandedLines(): Readonly<Record<AnnotationSide, ReadonlySet<number>>>;
  get hasCutRows(): boolean;
  startLayout(): void;
  setLimit(limit: number): void;
  expand({ additionLineNumber, deletionLineNumber }: LineExpansion): void;
  clear(): void;
  additionRow(base: Element, model: DiffModel | FileModel, lineIndex: number, lineNumber: number, deletionLineNumber?: number): Element;
  deletionRow(base: Element, model: DiffModel, lineIndex: number, lineNumber: number, additionLineNumber?: number): Element;
}
//#endregion
export { LineCuts, LineExpansion, cutLineLength };
//# sourceMappingURL=LineCuts.d.ts.map
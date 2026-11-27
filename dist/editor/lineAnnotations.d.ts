import { TextDocumentChange } from "./textDocument.js";
import { LineAnnotationPosition } from "../utils/lineAnnotationIdentity.js";
//#region src/editor/lineAnnotations.d.ts
declare function applyDocumentChangeToLineAnnotations<TLineAnnotation extends LineAnnotationPosition>(change: TextDocumentChange, lineAnnotations: TLineAnnotation[]): TLineAnnotation[] | undefined;
//#endregion
export { applyDocumentChangeToLineAnnotations };
//# sourceMappingURL=lineAnnotations.d.ts.map
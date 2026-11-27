import { File } from "../../components/File.js";
import { FileDiff } from "../../components/FileDiff.js";
//#region src/react/utils/useEditorAttach.d.ts
type EditableInstance<LAnnotation, Caret> = File<LAnnotation, Caret> | FileDiff<LAnnotation, Caret>;
interface EditorAttach<LAnnotation, Caret> {
  attachWhenReady(instance: EditableInstance<LAnnotation, Caret>, applyEdit: () => () => void, onAttached: () => void): void;
  detach(): void;
  forget(): void;
  isAttached(): boolean;
}
/**
 * Keeps an editor attached to a File or FileDiff instance for the React
 * hooks. The hooks call `attachWhenReady` from their render effect, which
 * runs again after the instance re-renders itself, so a wait that ends with
 * the instance still not ready is retried on that render. An error from the
 * wait is thrown on the next render.
 */
declare function useEditorAttach<LAnnotation, Caret>(): EditorAttach<LAnnotation, Caret>;
//#endregion
export { EditorAttach, useEditorAttach };
//# sourceMappingURL=useEditorAttach.d.ts.map
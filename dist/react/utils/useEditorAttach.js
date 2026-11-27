import { useMemo, useRef, useState } from "react";
//#region src/react/utils/useEditorAttach.ts
/**
* Keeps an editor attached to a File or FileDiff instance for the React
* hooks. The hooks call `attachWhenReady` from their render effect, which
* runs again after the instance re-renders itself, so a wait that ends with
* the instance still not ready is retried on that render. An error from the
* wait is thrown on the next render.
*/
function useEditorAttach() {
	const [asyncAttachError, setAsyncAttachError] = useState();
	if (asyncAttachError != null) throw asyncAttachError;
	const state = useRef({
		disposeEditor: null,
		pendingAttach: null
	});
	return useMemo(() => {
		const { current } = state;
		return {
			isAttached: () => current.disposeEditor != null,
			detach() {
				current.pendingAttach = null;
				const { disposeEditor } = current;
				if (disposeEditor != null) {
					current.disposeEditor = null;
					disposeEditor();
				}
			},
			forget() {
				current.pendingAttach = null;
				current.disposeEditor = null;
			},
			attachWhenReady(instance, applyEdit, onAttached) {
				if (current.disposeEditor != null) return;
				const attach = () => {
					if (current.disposeEditor != null || !instance.isReadyToEdit()) return;
					current.disposeEditor = applyEdit();
					onAttached();
				};
				if (instance.isReadyToEdit()) {
					current.pendingAttach = null;
					attach();
					return;
				}
				const promise = instance.__prepareForEditing();
				if (promise == null) {
					current.pendingAttach = null;
					return;
				}
				if (current.pendingAttach?.promise === promise) return;
				const pending = { promise };
				current.pendingAttach = pending;
				promise.then(() => {
					if (current.pendingAttach !== pending) return;
					attach();
					current.pendingAttach = null;
				}).catch((error) => {
					if (current.pendingAttach === pending) {
						current.pendingAttach = null;
						setAsyncAttachError(error);
					}
				});
			}
		};
	}, []);
}
//#endregion
export { useEditorAttach };

//# sourceMappingURL=useEditorAttach.js.map
import { resolveEditorCommandFromKeyboardEvent, resolveFindAgainShortcut, resolveSearchShortcut } from "../editor/command.js";
import { TextDocument, changeMovesLines } from "../editor/textDocument.js";
import { EditStateManager, cloneEditorViewState, toManagedEditState } from "../editor/EditStateManager.js";
import { POPOVER_BOUNDARY_LINES, POPOVER_FLIP_HYSTERESIS_PX, PopoverManager, setPopoverPositionStyles } from "../editor/popover.js";
import { MarkerRenderer, markerSeverityDatasetKey } from "../editor/marker.js";
import { Editor } from "../editor/editor.js";
export { EditStateManager, Editor, MarkerRenderer, POPOVER_BOUNDARY_LINES, POPOVER_FLIP_HYSTERESIS_PX, PopoverManager, TextDocument, changeMovesLines, cloneEditorViewState, markerSeverityDatasetKey, resolveEditorCommandFromKeyboardEvent, resolveFindAgainShortcut, resolveSearchShortcut, setPopoverPositionStyles, toManagedEditState };

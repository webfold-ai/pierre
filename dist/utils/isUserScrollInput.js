//#region src/utils/isUserScrollInput.ts
const SCROLL_KEYS = /* @__PURE__ */ new Set([
	"ArrowUp",
	"ArrowDown",
	"ArrowLeft",
	"ArrowRight",
	"PageUp",
	"PageDown",
	"Home",
	"End",
	" "
]);
function isUserScrollInput(event) {
	if (event.defaultPrevented) return false;
	if (event.type !== "keydown") return true;
	return "key" in event && typeof event.key === "string" && SCROLL_KEYS.has(event.key);
}
//#endregion
export { isUserScrollInput };

//# sourceMappingURL=isUserScrollInput.js.map
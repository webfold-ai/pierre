//#region src/utils/createSVGSpriteElement.d.ts
declare function createSVGSpriteElement(): SVGElement | undefined;
/**
 * Prerendered HTML carries only the icons its own markup uses (see
 * ssr/renderHTML.ts). Hydration swaps such a partial sheet for the full one,
 * so icons the component renders later (separators, gutter utility, header
 * changes) still resolve.
 */
declare function hydrateSVGSpriteElement(element: SVGElement): SVGElement;
//#endregion
export { createSVGSpriteElement, hydrateSVGSpriteElement };
//# sourceMappingURL=createSVGSpriteElement.d.ts.map
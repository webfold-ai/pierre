import { f as MermaidPlugin } from "./types-BP3TAJSp.js";
//#region html/mermaid.d.ts
/** The part of Pele's API the plugin uses: `import { render } from 'pele'`. */
interface MermaidRenderer<Options> {
  render(source: string, options?: Options): {
    svg: string;
  };
}
/**
 * Render `mermaid` code blocks as SVG with Pele. An open fence draws its
 * complete lines and keeps the last diagram that parsed; with no diagram yet it
 * shows nothing. A closed diagram that does not parse shows as a code block.
 */
declare function createMermaidPlugin<Options>(pele: MermaidRenderer<Options>, options?: Options): MermaidPlugin;
//#endregion
export { MermaidRenderer, createMermaidPlugin };
//# sourceMappingURL=mermaid.d.ts.map
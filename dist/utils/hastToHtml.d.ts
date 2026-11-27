import { Nodes, Properties, RootContent } from "../node_modules/.pnpm/@types_hast@3.0.4/node_modules/@types/hast/index.js";
//#region src/utils/hastToHtml.d.ts
/**
 * Serializes a HAST node or node array to HTML. Common token spans use a fast
 * path; other nodes and attributes use hast-util-to-html's default serialization.
 */
declare function hastToHtml(tree: Nodes | RootContent[]): string;
/**
 * The attribute a HAST property serializes to: its name and value as the
 * markup carries them. `null` when the property writes nothing (unset,
 * false or NaN), undefined when it needs the full HTML schema.
 */
declare function attributeFor(key: string, value: Properties[string]): {
  name: string;
  value: string;
} | null | undefined;
//#endregion
export { attributeFor, hastToHtml };
//# sourceMappingURL=hastToHtml.d.ts.map
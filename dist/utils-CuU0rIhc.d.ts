//#region lib/utils.d.ts
declare function escapeHtml(value: string): string;
/**
 * Return `url` if it is relative or uses http, https, mailto, tel, or a scheme
 * the parser autolinks (ftp, xmpp). Reject network paths.
 */
declare function defaultUrlTransform(url: string): string | undefined;
//#endregion
export { escapeHtml as n, defaultUrlTransform as t };
//# sourceMappingURL=utils-CuU0rIhc.d.ts.map
//#region src/utils/reportEditWithoutTokenTransformer.d.ts
declare const TOKEN_TRANSFORMER_DOCS_URL = "https://diffs.com/docs#edit-mode-performance-and-loading-worker-pool";
/**
 * Logs an error for a file or diff that enters edit mode from markup rendered
 * without the token transformer, which is required for editing. The highlight
 * cache and DOM cannot be re-used which can cause extra work when entering
 * edit mode. Production builds stay silent.
 */
declare function reportEditWithoutTokenTransformer(fileName: string): void;
//#endregion
export { TOKEN_TRANSFORMER_DOCS_URL, reportEditWithoutTokenTransformer };
//# sourceMappingURL=reportEditWithoutTokenTransformer.d.ts.map
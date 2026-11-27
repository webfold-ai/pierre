//#region src/i18n/compileMessage.d.ts
type MessageValues = Record<string, number | string>;
type CompiledMessage = (values?: MessageValues) => string;
declare function compileMessage(template: string, pluralRules: Intl.PluralRules, numberFormat: Intl.NumberFormat): CompiledMessage;
//#endregion
export { CompiledMessage, MessageValues, compileMessage };
//# sourceMappingURL=compileMessage.d.ts.map
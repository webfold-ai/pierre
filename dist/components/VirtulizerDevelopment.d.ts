import { Virtualizer } from "./Virtualizer.js";
import { CodeView } from "./CodeView.js";
//#region src/components/VirtulizerDevelopment.d.ts
// Browser debug hooks installed only in development builds.
declare global {
  interface Window {
    // oxlint-disable-next-line typescript/no-explicit-any
    __INSTANCE?: CodeView<any, any> | Virtualizer;
    __TOGGLE?: () => void;
    __LOG?: boolean;
  }
}
//# sourceMappingURL=VirtulizerDevelopment.d.ts.map
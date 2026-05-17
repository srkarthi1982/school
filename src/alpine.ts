import type { Alpine } from "alpinejs";
import { registerAppDrawerStore } from "./modules/app/drawerStore";

export default function initAlpine(Alpine: Alpine) {
  registerAppDrawerStore(Alpine);

  if (typeof window !== "undefined") {
    window.Alpine = Alpine;
  }
}

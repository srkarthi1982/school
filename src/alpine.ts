import type { Alpine } from "alpinejs";
import { registerAppDrawerStore } from "./modules/app/drawerStore";
import { registerSchoolFoundationStore } from "./modules/school-foundation/store";

export default function initAlpine(Alpine: Alpine) {
  registerAppDrawerStore(Alpine);
  registerSchoolFoundationStore(Alpine);

  if (typeof window !== "undefined") {
    window.Alpine = Alpine;
  }
}

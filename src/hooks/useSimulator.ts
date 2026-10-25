import { useSyncExternalStore } from "react";
import * as sim from "@/lib/simulator";

export function useSimulator() {
  return useSyncExternalStore(sim.subscribe, sim.getSnapshot, sim.getSnapshot);
}

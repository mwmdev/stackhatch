"use client";

import { createContext, useContext } from "react";
import type { MapLayout } from "@/types/stack";

/** The map's current auto-layout style; connection routing follows it. */
export const MapLayoutContext = createContext<MapLayout>("tiers");

export function useMapLayout(): MapLayout {
  return useContext(MapLayoutContext);
}

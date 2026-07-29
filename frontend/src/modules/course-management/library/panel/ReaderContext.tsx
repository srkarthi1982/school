import React, { createContext, useContext, useEffect } from "react";
import { useShallow } from "zustand/react/shallow";
import { useLibrarySummaryStore } from "../store";
import type { FileVersion } from "../store";

export type ReaderToolKey = "mindMap" | "voiceNarration" | "quickSummary" | "filePreview" | "docChat";

type MaterialType = "pdf" | "office" | "other";

interface ReaderContextValue {
  materialId: string;
  material: FileVersion | null;
  materialType: MaterialType;
}

const ReaderContext = createContext<ReaderContextValue | null>(null);

export const useReaderContext = () => {
  const ctx = useContext(ReaderContext);
  if (!ctx) {
    throw new Error("useReaderContext must be used within ReaderProvider");
  }
  return ctx;
};

export const ReaderProvider: React.FC<{
  materialId: string;
  material: FileVersion | null;
  materialType: MaterialType;
  children: React.ReactNode;
}> = ({ materialId, material, materialType, children }) => {
  const { getSummary, getMindmap, getVoiceNarrationText } = useLibrarySummaryStore(
    useShallow((s) => ({
      getSummary: s.getSummary,
      getMindmap: s.getMindmap,
      getVoiceNarrationText: s.getVoiceNarrationText,
    }))
  );

  useEffect(() => {
    const id = Number(materialId);
    if (isNaN(id)) return;
    getSummary(id);
    getMindmap(id);
    getVoiceNarrationText(id);
  }, [materialId, getSummary, getMindmap, getVoiceNarrationText]);

  return (
    <ReaderContext.Provider value={{ materialId, material, materialType }}>
      {children}
    </ReaderContext.Provider>
  );
};

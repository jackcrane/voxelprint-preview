import { useCallback, useMemo, useState } from "react";

const clampQuality = (value) => Math.max(50, Math.min(150, value));

export const useQualitySettings = (baseFullSteps) => {
  const [qualityPct, setQualityPct] = useState(100);

  const fullSteps = useMemo(() => {
    const scaled = Math.round(baseFullSteps * (qualityPct / 100));
    return Math.min(1024, Math.max(48, scaled));
  }, [baseFullSteps, qualityPct]);

  const previewSteps = useMemo(() => {
    const proposed = Math.round(fullSteps * 0.5);
    const limited = Math.max(32, proposed);
    if (limited >= fullSteps) {
      return Math.max(32, fullSteps - 16);
    }
    return limited;
  }, [fullSteps]);

  const qualityLabel = useMemo(() => {
    if (qualityPct <= 75) return "Draft";
    if (qualityPct >= 125) return "High";
    return "Balanced";
  }, [qualityPct]);

  const updateQuality = useCallback(
    (value) => {
      if (!Number.isFinite(value)) return;
      setQualityPct(clampQuality(value));
    },
    [setQualityPct]
  );

  return {
    qualityPct,
    updateQuality,
    fullSteps,
    previewSteps,
    qualityLabel,
  };
};

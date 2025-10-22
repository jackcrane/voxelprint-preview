import { useCallback, useMemo, useState } from "react";

import {
  MATERIAL_COLOR_MAP,
  MATERIAL_LOOKUP,
} from "../constants/materials.js";

export const useMaterialMappings = () => {
  const [materialColorMap, setMaterialColorMap] = useState(() => ({
    ...MATERIAL_COLOR_MAP,
  }));
  const [pendingMissingColors, setPendingMissingColors] = useState([]);
  const [materialSelectionDraft, setMaterialSelectionDraft] = useState({});
  const [mappingModalVisible, setMappingModalVisible] = useState(false);

  const handleMissingMaterials = useCallback((missingKeys) => {
    if (missingKeys && missingKeys.length) {
      setPendingMissingColors(missingKeys);
      setMaterialSelectionDraft((prev) => {
        const next = {};
        missingKeys.forEach((key) => {
          next[key] = prev[key] || "";
        });
        return next;
      });
      setMappingModalVisible(true);
    } else {
      setPendingMissingColors([]);
      setMaterialSelectionDraft({});
      setMappingModalVisible(false);
    }
  }, []);

  const handleMaterialSelectionChange = useCallback((missingKey, mappedKey) => {
    setMaterialSelectionDraft((prev) => ({
      ...prev,
      [missingKey]: mappedKey,
    }));
  }, []);

  const canApplyMaterialMappings = useMemo(() => {
    if (!pendingMissingColors.length) {
      return false;
    }
    return pendingMissingColors.every(
      (key) => materialSelectionDraft[key] && materialSelectionDraft[key].length
    );
  }, [pendingMissingColors, materialSelectionDraft]);

  const applyMaterialMappings = useCallback(() => {
    if (!pendingMissingColors.length) {
      return;
    }
    setMaterialColorMap((prev) => {
      const next = { ...prev };
      pendingMissingColors.forEach((missingKey) => {
        const mappedKey = materialSelectionDraft[missingKey];
        if (!mappedKey) {
          return;
        }
        const source =
          prev[mappedKey] ||
          MATERIAL_COLOR_MAP[mappedKey] ||
          MATERIAL_LOOKUP[mappedKey]?.rgba;
        if (source) {
          next[missingKey] = [...source];
        }
      });
      return next;
    });
    setPendingMissingColors([]);
    setMaterialSelectionDraft({});
    setMappingModalVisible(false);
  }, [materialSelectionDraft, pendingMissingColors]);

  return {
    materialColorMap,
    pendingMissingColors,
    materialSelectionDraft,
    mappingModalVisible,
    canApplyMaterialMappings,
    handleMissingMaterials,
    handleMaterialSelectionChange,
    applyMaterialMappings,
    closeMappingModal: () => setMappingModalVisible(false),
    openMappingModal: () => setMappingModalVisible(true),
  };
};

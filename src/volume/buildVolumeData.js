import {
  CLEAR_MATERIAL_KEY,
  MATERIAL_COLOR_MAP,
} from "../constants/materials.js";
import {
  materialPaletteFromMap,
  serializePaletteColor,
} from "./palette.js";
import { buildDepthIndices, computeDownsampleStep } from "./downsample.js";
import { populateSlice } from "./populateSlice.js";

const createCanvasContext = () => {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) {
    throw new Error("Unable to acquire 2D canvas context for volume processing.");
  }
  return { canvas, ctx };
};

export const buildVolumeData = async (
  slices,
  onProgress,
  materialColorMap = MATERIAL_COLOR_MAP
) => {
  const missingSamples = new Set();
  const depth = slices.length;
  const depthIndices = buildDepthIndices(depth);
  const targetDepth = depthIndices.length;
  const useMaterialMap = materialColorMap !== null && materialColorMap !== undefined;
  const { palette, lookup } = useMaterialMap
    ? materialPaletteFromMap(materialColorMap)
    : { palette: [], lookup: new Map() };
  const paletteLookup = {
    lookup,
    materialMap: useMaterialMap ? materialColorMap : null,
  };
  const { canvas, ctx } = createCanvasContext();

  const state = {
    width: 0,
    height: 0,
    xStep: 1,
    yStep: 1,
    targetWidth: 0,
    targetHeight: 0,
    data: null,
    canvas,
    ctx,
    computeStep: computeDownsampleStep,
  };

  for (let targetZ = 0; targetZ < targetDepth; targetZ += 1) {
    await populateSlice(
      targetZ,
      depthIndices,
      slices,
      state,
      palette,
      paletteLookup,
      missingSamples
    );
    if (onProgress) {
      onProgress(Math.round(((targetZ + 1) / targetDepth) * 100));
    }
  }

  if (!state.data) {
    throw new Error("Failed to build volume texture data.");
  }

  const clearColor =
    useMaterialMap && materialColorMap
      ? materialColorMap[CLEAR_MATERIAL_KEY]
      : null;
  const clearKey = clearColor ? serializePaletteColor(clearColor) : null;
  const clearPaletteIndex =
    clearKey && lookup.has(clearKey) ? lookup.get(clearKey) : -1;

  return {
    data: state.data,
    palette,
    missingColors: Array.from(missingSamples),
    voxelDimensions: {
      width: state.targetWidth,
      height: state.targetHeight,
      depth: targetDepth,
    },
    clearPaletteIndex,
  };
};

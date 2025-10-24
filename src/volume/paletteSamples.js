import { ensurePaletteEntry, mapMaterialColor } from "./palette.js";

export const addPaletteSample = (
  paletteLookup,
  palette,
  color,
  missingSamples,
  localMissing
) => {
  const mapped = paletteLookup.materialMap
    ? mapMaterialColor(
        color[0],
        color[1],
        color[2],
        color[3],
        missingSamples,
        localMissing,
        paletteLookup.materialMap
      )
    : color;
  return ensurePaletteEntry(paletteLookup.lookup, palette, mapped);
};

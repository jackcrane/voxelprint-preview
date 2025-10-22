import { MAX_LOGGED_MISSING, MAX_PALETTE_SIZE } from "../constants/materials";

export const clampByte = (value) => Math.max(0, Math.min(255, Math.round(value)));

export const mapMaterialColor = (
  r,
  g,
  b,
  a,
  missingSamples,
  localMissing,
  materialColorMap
) => {
  const key = `${r} ${g} ${b} ${a}`;
  const mapped = materialColorMap[key];
  if (mapped) {
    return mapped;
  }

  if (
    missingSamples.size < MAX_LOGGED_MISSING &&
    localMissing.size < MAX_LOGGED_MISSING
  ) {
    localMissing.add(key);
  }

  return [r, g, b, a];
};

export const ensurePaletteEntry = (lookup, palette, color) => {
  const key = color.join(",");
  if (lookup.has(key)) {
    return lookup.get(key);
  }

  if (palette.length >= MAX_PALETTE_SIZE) {
    throw new Error(
      `Palette overflow: encountered more than ${MAX_PALETTE_SIZE} unique colors`
    );
  }

  const entry = [
    clampByte(color[0]),
    clampByte(color[1]),
    clampByte(color[2]),
    clampByte(color[3]),
  ];

  const index = palette.length;
  palette.push(entry);
  lookup.set(key, index);
  return index;
};

export const materialPaletteFromMap = (materialColorMap) => {
  const palette = [];
  const lookup = new Map();
  Object.values(materialColorMap).forEach((rgba) => {
    ensurePaletteEntry(lookup, palette, rgba);
  });
  return { palette, lookup };
};

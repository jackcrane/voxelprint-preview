import { MAX_LOGGED_MISSING, MAX_PALETTE_SIZE } from "../constants/materials";

export const clampByte = (value) => Math.max(0, Math.min(255, Math.round(value)));

const normalizeChannelForPalette = (value) => {
  if (!Number.isFinite(value)) {
    return 0;
  }
  if (value <= 1 && value >= 0) {
    return clampByte(value * 255);
  }
  return clampByte(value);
};

export const normalizePaletteColor = (color) =>
  color.map((channel) => normalizeChannelForPalette(channel));

export const serializePaletteColor = (color) =>
  normalizePaletteColor(color).join(",");

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
    return [...mapped];
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
  const normalized = normalizePaletteColor(color);
  const key = normalized.join(",");
  if (lookup.has(key)) {
    return lookup.get(key);
  }

  if (palette.length >= MAX_PALETTE_SIZE) {
    let nearestIndex = 0;
    let nearestDistance = Infinity;
    for (let i = 0; i < palette.length; i += 1) {
      const existing = palette[i];
      const dr = existing[0] - normalized[0];
      const dg = existing[1] - normalized[1];
      const db = existing[2] - normalized[2];
      const da = existing[3] - normalized[3];
      const distance = dr * dr + dg * dg + db * db + da * da;
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearestIndex = i;
        if (distance === 0) {
          break;
        }
      }
    }
    lookup.set(key, nearestIndex);
    return nearestIndex;
  }

  const index = palette.length;
  palette.push(normalized);
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

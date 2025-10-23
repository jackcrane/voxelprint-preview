export const MATERIAL_DEFINITIONS = [
  { key: "0 255 255 255", rgba: [0, 255, 255, 140], name: "VeroCY-V" },
  { key: "255 0 255 255", rgba: [255, 0, 255, 200], name: "VeroMGT-V" },
  { key: "255 255 0 255", rgba: [255, 255, 0, 100], name: "VeroYL-C" },
  { key: "0 0 0 255", rgba: [0, 0, 0, 0], name: "VOID" },
  { key: "137 137 137 255", rgba: [137, 137, 137, 0.02], name: "UltraClear" },
  {
    key: "255 255 255 255",
    rgba: [255, 255, 255, 255],
    name: "VeroUltraWhite",
  },
];

export const MATERIAL_COLOR_MAP = MATERIAL_DEFINITIONS.reduce(
  (acc, { key, rgba }) => {
    acc[key] = [...rgba];
    return acc;
  },
  {}
);

export const MATERIAL_LOOKUP = MATERIAL_DEFINITIONS.reduce((acc, entry) => {
  acc[entry.key] = entry;
  return acc;
}, {});

export const CLEAR_MATERIAL_KEY = "137 137 137 255";
export const CLEAR_ALPHA_SCALE = 0.02;
export const MAX_LOGGED_MISSING = 8;
export const MAX_PALETTE_SIZE = 256;

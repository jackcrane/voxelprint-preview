import { CLEAR_ALPHA_SCALE } from "../constants/materials.js";

export const paletteToLinear = (palette, clearIndex) =>
  palette.map((rgba, index) => {
    const alphaScale = index === clearIndex ? CLEAR_ALPHA_SCALE : 1;
    return [
      rgba[0] / 255,
      rgba[1] / 255,
      rgba[2] / 255,
      (rgba[3] / 255) * alphaScale,
    ];
  });

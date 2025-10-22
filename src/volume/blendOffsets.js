import {
  BLEND_CENTER_WEIGHT,
  BLEND_FALLOFF,
} from "../constants/volume.js";

export const buildOffsets = (radius) => {
  const offsets = [{ dx: 0, dy: 0, dz: 0, weight: BLEND_CENTER_WEIGHT }];
  for (let step = 1; step <= radius; step += 1) {
    const weight = BLEND_CENTER_WEIGHT * Math.pow(BLEND_FALLOFF, step);
    offsets.push(
      { dx: step, dy: 0, dz: 0, weight },
      { dx: -step, dy: 0, dz: 0, weight },
      { dx: 0, dy: step, dz: 0, weight },
      { dx: 0, dy: -step, dz: 0, weight },
      { dx: 0, dy: 0, dz: step, weight },
      { dx: 0, dy: 0, dz: -step, weight }
    );
  }
  return offsets;
};

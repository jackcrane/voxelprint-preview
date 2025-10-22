import { TARGET_AXIS_RESOLUTION } from "../constants/volume.js";

export const computeDownsampleStep = (size) =>
  Math.max(1, Math.ceil(size / TARGET_AXIS_RESOLUTION));

export const buildDepthIndices = (depth) => {
  const step = computeDownsampleStep(depth);
  const indices = [];
  for (let z = 0; z < depth; z += step) {
    indices.push(z);
  }
  if (indices[indices.length - 1] !== depth - 1) {
    indices.push(depth - 1);
  }
  return indices;
};

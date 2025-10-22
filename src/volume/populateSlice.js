import { decodeSlice } from "./decodeSlice.js";
import { addPaletteSample } from "./paletteSamples.js";

const ensureDataBuffer = (state, targetDepth) => {
  if (!state.data) {
    state.data = new Uint8Array(
      state.targetWidth * state.targetHeight * targetDepth
    );
  }
};

const initializeDimensions = (state, asset) => {
  state.width = asset.width;
  state.height = asset.height;
  state.xStep = state.computeStep(asset.width);
  state.yStep = state.computeStep(asset.height);
  state.targetWidth = Math.max(1, Math.ceil(asset.width / state.xStep));
  state.targetHeight = Math.max(1, Math.ceil(asset.height / state.yStep));
  state.canvas.width = asset.width;
  state.canvas.height = asset.height;
};

export const populateSlice = async (
  targetZ,
  depthIndices,
  slices,
  state,
  palette,
  paletteLookup,
  missingSamples
) => {
  const sourceIndex = depthIndices[targetZ];
  const asset = await decodeSlice(slices[sourceIndex]);

  if (!state.width) {
    initializeDimensions(state, asset);
    ensureDataBuffer(state, depthIndices.length);
  } else if (asset.width !== state.width || asset.height !== state.height) {
    asset.close();
    throw new Error(
      `Slice ${sourceIndex} dimensions ${asset.width}x${asset.height} differ from initial ${state.width}x${state.height}`
    );
  }

  state.ctx.clearRect(0, 0, state.width, state.height);
  asset.draw(state.ctx);
  asset.close();

  const imageData = state.ctx.getImageData(0, 0, state.width, state.height);
  const pixels = imageData.data;
  const localMissing = new Set();
  const sliceOffset =
    targetZ * state.targetWidth * state.targetHeight;

  for (let targetY = 0; targetY < state.targetHeight; targetY += 1) {
    const sourceY = Math.min(targetY * state.yStep, state.height - 1);
    const rowBase = sliceOffset + targetY * state.targetWidth;
    for (let targetX = 0; targetX < state.targetWidth; targetX += 1) {
      const sourceX = Math.min(targetX * state.xStep, state.width - 1);
      const pixelIndex = (sourceY * state.width + sourceX) * 4;
      const paletteIndex = addPaletteSample(
        paletteLookup,
        palette,
        [
          pixels[pixelIndex],
          pixels[pixelIndex + 1],
          pixels[pixelIndex + 2],
          pixels[pixelIndex + 3],
        ],
        missingSamples,
        localMissing
      );
      state.data[rowBase + targetX] = paletteIndex;
    }
  }

  localMissing.forEach((key) => missingSamples.add(key));
};

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

const sampleBlockColor = (
  pixels,
  width,
  height,
  xStart,
  xEnd,
  yStart,
  yEnd,
  outColor
) => {
  // Sample the pixel at the center of the block (clamped to edges) to avoid
  // traversing every source pixel. This trades fidelity for a large speedup.
  const sampleY =
    yStart >= yEnd
      ? Math.min(yStart, height - 1)
      : Math.min(yEnd - 1, yStart + ((yEnd - yStart) >> 1));
  const sampleX =
    xStart >= xEnd
      ? Math.min(xStart, width - 1)
      : Math.min(xEnd - 1, xStart + ((xEnd - xStart) >> 1));
  const pixelIndex = (sampleY * width + sampleX) * 4;
  outColor[0] = pixels[pixelIndex];
  outColor[1] = pixels[pixelIndex + 1];
  outColor[2] = pixels[pixelIndex + 2];
  outColor[3] = pixels[pixelIndex + 3];
  return outColor;
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
  const sliceOffset = targetZ * state.targetWidth * state.targetHeight;
  if (!state.sampleColor) {
    state.sampleColor = new Uint8ClampedArray(4);
  }

  for (let targetY = 0; targetY < state.targetHeight; targetY += 1) {
    const sourceYStart = targetY * state.yStep;
    const sourceYEnd = Math.min(sourceYStart + state.yStep, state.height);
    const flippedY = state.targetHeight - 1 - targetY;
    const rowBase = sliceOffset + flippedY * state.targetWidth;
    for (let targetX = 0; targetX < state.targetWidth; targetX += 1) {
      const sourceXStart = targetX * state.xStep;
      const sourceXEnd = Math.min(sourceXStart + state.xStep, state.width);
      const blockColor = sampleBlockColor(
        pixels,
        state.width,
        state.height,
        sourceXStart,
        sourceXEnd,
        sourceYStart,
        sourceYEnd,
        state.sampleColor
      );
      const paletteIndex = addPaletteSample(
        paletteLookup,
        palette,
        blockColor,
        missingSamples,
        localMissing
      );
      state.data[rowBase + targetX] = paletteIndex;
    }
  }

  localMissing.forEach((key) => missingSamples.add(key));
};

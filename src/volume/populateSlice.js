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

const selectDominantColor = (pixels, width, xStart, xEnd, yStart, yEnd) => {
  const colorCounts = new Map();
  let bestEntry = null;

  for (let sourceY = yStart; sourceY < yEnd; sourceY += 1) {
    const rowOffset = sourceY * width;
    for (let sourceX = xStart; sourceX < xEnd; sourceX += 1) {
      const pixelIndex = (rowOffset + sourceX) * 4;
      const r = pixels[pixelIndex];
      const g = pixels[pixelIndex + 1];
      const b = pixels[pixelIndex + 2];
      const a = pixels[pixelIndex + 3];
      const key = `${r},${g},${b},${a}`;
      let entry = colorCounts.get(key);
      if (!entry) {
        entry = {
          count: 0,
          color: [r, g, b, a],
          isTransparent: a === 0,
        };
        colorCounts.set(key, entry);
      }
      entry.count += 1;
      if (
        !bestEntry ||
        entry.count > bestEntry.count ||
        (entry.count === bestEntry.count &&
          entry.isTransparent &&
          !bestEntry.isTransparent)
      ) {
        bestEntry = entry;
      }
    }
  }

  return bestEntry ? bestEntry.color : [0, 0, 0, 0];
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

  for (let targetY = 0; targetY < state.targetHeight; targetY += 1) {
    const sourceYStart = targetY * state.yStep;
    const sourceYEnd = Math.min(sourceYStart + state.yStep, state.height);
    const rowBase = sliceOffset + targetY * state.targetWidth;
    for (let targetX = 0; targetX < state.targetWidth; targetX += 1) {
      const sourceXStart = targetX * state.xStep;
      const sourceXEnd = Math.min(sourceXStart + state.xStep, state.width);
      const blockColor = selectDominantColor(
        pixels,
        state.width,
        sourceXStart,
        sourceXEnd,
        sourceYStart,
        sourceYEnd
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

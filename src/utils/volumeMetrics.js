import { INCH_TO_METER } from "../constants/units.js";

const ensurePositive = (value) => (value > 0 ? value : 0.001);

export const computeVolumeMetrics = (config) => {
  const {
    SliceWidth,
    SliceHeight,
    XDpi,
    YDpi,
    SliceThicknessNanoMeter,
    slices,
  } = config;

  const sliceWidthPx = Number(SliceWidth) || 0;
  const sliceHeightPx = Number(SliceHeight) || 0;
  const xDpi = Number(XDpi) || 1;
  const yDpi = Number(YDpi) || 1;
  const sliceCount = slices?.length || 0;

  const widthM = sliceWidthPx * (INCH_TO_METER / xDpi);
  const heightM = sliceHeightPx * (INCH_TO_METER / yDpi);

  const sliceThicknessM =
    (Number(SliceThicknessNanoMeter) || 0) * 1e-9 ||
    INCH_TO_METER / Math.max(xDpi, yDpi, 1);

  const depthM = sliceThicknessM * sliceCount;
  const safeDepthM =
    depthM > 0 ? depthM : Math.max(widthM, heightM, 0.001) * 0.01 || 0.001;

  const volumeScale = [
    ensurePositive(widthM),
    ensurePositive(heightM),
    ensurePositive(safeDepthM),
  ];

  const diag = Math.max(0.1, Math.hypot(widthM, heightM, safeDepthM));
  const cameraPosition = [0, diag * 1.1, diag * 1.35];

  const baseFullSteps = (() => {
    if (!sliceCount) return 128;
    const longestAxis = Math.max(sliceWidthPx, sliceHeightPx, sliceCount);
    const target = Math.round(longestAxis * 0.35);
    return Math.min(768, Math.max(96, target));
  })();

  return {
    volumeScale,
    diag,
    cameraPosition,
    sliceCount,
    baseFullSteps,
  };
};

export const TARGET_AXIS_RESOLUTION = 256;
export const BLEND_RADIUS_STEPS = 1;
export const BLEND_CENTER_WEIGHT = 16;
export const BLEND_FALLOFF = 10;
export const BLEND_ALPHA_SCALE = 0.5;

const RENDER_SCALE_DENOMINATORS = [1, 4, 9, 16];
export const RENDER_SCALE_OPTIONS = RENDER_SCALE_DENOMINATORS.map((denom) => {
  const label = `1/${denom}`;
  const ratio = 1 / denom;
  const xyStepMultiplier = Math.sqrt(denom);
  return {
    label,
    ratio,
    xyStepMultiplier,
  };
});

export const DEFAULT_RENDER_SCALE = RENDER_SCALE_OPTIONS[0];

export const GCVF_ALPHA_IMPACT_MIN = 0.01;
export const GCVF_ALPHA_IMPACT_MAX = 3;
export const GCVF_ALPHA_IMPACT_DEFAULT = 1.5;

export const LAYER_ALPHA_IMPACT_MIN = 0.01;
export const LAYER_ALPHA_IMPACT_MAX = 20;
export const LAYER_ALPHA_IMPACT_DEFAULT = 12;

export const SLICE_MODE_LAYER_HEIGHT_NM = 12_000;

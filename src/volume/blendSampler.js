export const makeSampler = (data, palette, dimensions) => {
  const { width, height, depth } = dimensions;
  const indexFor = (x, y, z) => z * width * height + y * width + x;

  return (accum, x, y, z, weight) => {
    if (!weight) return;
    if (x < 0 || y < 0 || z < 0 || x >= width || y >= height || z >= depth) {
      return;
    }
    const sample = palette[data[indexFor(x, y, z)]];
    if (!sample) return;
    const alpha = sample[3];
    if (alpha <= 0) return;
    const alphaWeight = weight * alpha;
    if (alphaWeight <= 0) return;
    const colorWeight = alphaWeight * alpha;
    accum.r += sample[0] * colorWeight;
    accum.g += sample[1] * colorWeight;
    accum.b += sample[2] * colorWeight;
    accum.colorWeight += colorWeight;
    accum.alpha += alpha * alphaWeight;
    accum.alphaWeight += alphaWeight;
  };
};

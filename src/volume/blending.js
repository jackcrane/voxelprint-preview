import * as THREE from "three";

import { clampByte } from "./palette.js";
import { paletteToLinear } from "./blendPalette.js";
import { buildOffsets } from "./blendOffsets.js";
import { makeSampler } from "./blendSampler.js";

export const createBlendedVolumeTexture = (
  data,
  dimensions,
  palette,
  clearPaletteIndex,
  radius
) => {
  if (!radius || radius < 1) return null;
  const { width, height, depth } = dimensions;
  if (!width || !height || !depth) return null;

  const normalizedPalette = paletteToLinear(palette, clearPaletteIndex);
  const sample = makeSampler(data, normalizedPalette, dimensions);
  const offsets = buildOffsets(radius);
  const blended = new Uint8Array(width * height * depth * 4);
  const indexFor = (x, y, z) => z * width * height + y * width + x;

  for (let z = 0; z < depth; z += 1) {
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const accum = {
          r: 0,
          g: 0,
          b: 0,
          alpha: 0,
          colorWeight: 0,
          alphaWeight: 0,
        };
        for (const { dx, dy, dz, weight } of offsets) {
          sample(accum, x + dx, y + dy, z + dz, weight);
        }

        const base = indexFor(x, y, z) * 4;
        if (!accum.colorWeight || !accum.alphaWeight) {
          blended[base] = 0;
          blended[base + 1] = 0;
          blended[base + 2] = 0;
          blended[base + 3] = 0;
          continue;
        }

        blended[base] = clampByte((accum.r / accum.colorWeight) * 255);
        blended[base + 1] = clampByte((accum.g / accum.colorWeight) * 255);
        blended[base + 2] = clampByte((accum.b / accum.colorWeight) * 255);

        const rawAlpha = (accum.alpha / accum.alphaWeight) * 255;
        blended[base + 3] =
          rawAlpha <= 0 ? 0 : Math.max(1, clampByte(rawAlpha));
      }
    }
  }

  const texture = new THREE.Data3DTexture(blended, width, height, depth);
  texture.format = THREE.RGBAFormat;
  texture.type = THREE.UnsignedByteType;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.unpackAlignment = 1;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
};

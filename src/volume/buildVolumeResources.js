import * as THREE from "three";

import { MATERIAL_COLOR_MAP } from "../constants/materials.js";
import { createBlendedVolumeTexture } from "./blending.js";
import { buildVolumeData } from "./buildVolumeData.js";
import { packPaletteTexture } from "./paletteTexture.js";

const createVolumeTexture = (data, dimensions) => {
  const texture = new THREE.Data3DTexture(
    data,
    dimensions.width,
    dimensions.height,
    dimensions.depth
  );
  texture.format = THREE.RedFormat;
  texture.type = THREE.UnsignedByteType;
  texture.minFilter = THREE.NearestFilter;
  texture.magFilter = THREE.NearestFilter;
  texture.unpackAlignment = 1;
  texture.needsUpdate = true;
  return texture;
};

export const buildVolumeResources = async (
  slices,
  onProgress,
  materialColorMap = MATERIAL_COLOR_MAP,
  blendRadius = 0
) => {
  if (!slices?.length) return null;

  const {
    data,
    palette,
    voxelDimensions,
    clearPaletteIndex,
    missingColors,
  } = await buildVolumeData(slices, onProgress, materialColorMap);

  const volumeTexture = createVolumeTexture(data, voxelDimensions);
  const blendedVolumeTexture = createBlendedVolumeTexture(
    data,
    voxelDimensions,
    palette,
    clearPaletteIndex,
    blendRadius
  );

  return {
    volumeTexture,
    paletteTexture: packPaletteTexture(palette),
    paletteSize: palette.length,
    clearPaletteIndex,
    voxelDimensions,
    blendedVolumeTexture,
    missingColors,
  };
};

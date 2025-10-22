export const disposeVolumeResources = (resource) => {
  if (!resource) return;
  resource.volumeTexture?.dispose?.();
  resource.paletteTexture?.dispose?.();
  resource.blendedVolumeTexture?.dispose?.();
};

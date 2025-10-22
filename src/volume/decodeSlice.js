const useBitmap = typeof createImageBitmap === "function";

const loadImage = (blob) =>
  new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => resolve({ image: img, url });
    img.onerror = (error) => {
      URL.revokeObjectURL(url);
      reject(error);
    };
    img.src = url;
  });

export const decodeSlice = async (blob) => {
  if (useBitmap) {
    const bitmap = await createImageBitmap(blob);
    return {
      width: bitmap.width,
      height: bitmap.height,
      draw: (ctx) => ctx.drawImage(bitmap, 0, 0),
      close: () => bitmap.close(),
    };
  }

  const { image, url } = await loadImage(blob);
  return {
    width: image.width,
    height: image.height,
    draw: (ctx) => ctx.drawImage(image, 0, 0),
    close: () => URL.revokeObjectURL(url),
  };
};

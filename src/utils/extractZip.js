import JSZip from "jszip";

export const extractZip = async (file) => {
  const zip = await JSZip.loadAsync(file);
  const files = {};
  for (const [name, entry] of Object.entries(zip.files)) {
    if (!entry.dir) {
      files[name.split("/").pop()] = await entry.async("blob");
    }
  }
  return files;
};

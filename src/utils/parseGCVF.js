export const parseGCVF = (xmlText) => {
  const parser = new DOMParser();
  const xml = parser.parseFromString(xmlText, "application/xml");

  const get = (tag) => xml.querySelector(tag)?.textContent.trim();

  const mats = Array.from(xml.querySelectorAll("Material")).map((m) => ({
    name: m.querySelector("Name")?.textContent,
    rgba: m
      .querySelector("RGBA")
      ?.textContent.split(" ")
      .map((n) => parseInt(n)),
    voxelCount: parseInt(m.querySelector("VoxelCount")?.textContent || 0),
  }));

  return {
    Version: get("Version"),
    XDpi: parseInt(get("XDpi")),
    YDpi: parseInt(get("YDpi")),
    SliceThicknessNanoMeter: parseInt(get("SliceThicknessNanoMeter")),
    SliceWidth: parseInt(get("SliceWidth")),
    SliceHeight: parseInt(get("SliceHeight")),
    StartIndex: parseInt(get("StartIndex")),
    NumberOfSlices: parseInt(get("NumberOfSlices")),
    ImageFilePrefix: get("ImageFilePrefix"),
    MaterialList: mats,
  };
};

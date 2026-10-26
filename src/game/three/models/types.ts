// A low-poly model with a baked texture atlas, produced by scripts/bake-model.py.
// size = [width, height, depth] in metres. pos and uv are base64 uint16 arrays (three vertices per
// triangle, positions relative to min/span), jpeg is the base64 atlas image.
export type BakedModel = {
  size: number[];
  min: number[];
  span: number[];
  pos: string;
  uv: string;
  atlas: number;
  jpeg: string;
  alpha?: string; // optional greyscale JPEG used as a cut-out mask
  frames?: string[]; // more poses of the same triangles (like pos), blended as morph targets
};

// A vertex-coloured low-poly model produced by scripts/convert-model.py.
// size = [width, height, depth] in metres; p = positions, c = RGB bytes per vertex, i = triangles.
export type ModelData = {
  size: number[];
  p: number[];
  c: number[];
  i: number[];
};

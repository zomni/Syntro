// re-arrange coordinates

export const reArrange = (coord) => {
  let newPoly = [];
  if (!Array.isArray(coord)) {
    return [];
  }
  if (coord.length == 2) {
    let newCoord = [coord[1], coord[0]];
    return newCoord;
  } else if (Array.isArray(coord[0]) && coord[0].length > 2) {
    coord[0].map((element) => newPoly.push(reArrange(element)));
  }
  return [newPoly];
};

// Create an empty SVG elements
export const createSvgElement = () => {
  var svgElement = document.createElementNS(
    "http://www.w3.org/2000/svg",
    "svg"
  );
  svgElement.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  svgElement.setAttribute("viewBox", "0 0 200 200");
  return svgElement;
};
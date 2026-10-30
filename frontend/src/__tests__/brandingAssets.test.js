const fs = require("fs");
const path = require("path");

const assetsDir = path.join(__dirname, "..", "assets");
const brandingDir = path.join(assetsDir, "branding");
const indexHtml = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");

describe("branding assets", () => {
  test("incluye los assets de identidad visual y derivados de iconos", () => {
    [
      "syntro-logo-mark.svg",
      "syntro-logo-mark-1024.png",
      "syntro-logo-horizontal-claro.svg",
      "syntro-logo-horizontal-oscuro.svg",
      "syntro-icon-simple.svg",
      "syntro-icon-512.png",
      "apple-touch-icon-180.png",
      "favicon.ico",
    ].forEach((asset) => {
      expect(fs.existsSync(path.join(brandingDir, asset))).toBe(true);
    });
  });

  test("referencia el favicon SVG, ICO y apple touch icon", () => {
    expect(indexHtml).toContain('href="assets/branding/syntro-icon-simple.svg?v=20261030a"');
    expect(indexHtml).toContain('href="assets/branding/favicon.ico?v=20261030a"');
    expect(indexHtml).toContain('href="assets/branding/apple-touch-icon-180.png?v=20261030a"');
  });

  test("conserva las placas internas de la identidad visual", () => {
    const mark = fs.readFileSync(path.join(brandingDir, "syntro-logo-mark.svg"), "utf8");
    const simpleIcon = fs.readFileSync(path.join(brandingDir, "syntro-icon-simple.svg"), "utf8");
    expect(mark).toContain('fill="url(#mbg)" stroke="url(#mrim)"');
    expect(simpleIcon).toContain('fill="url(#ibg)" stroke="url(#irim)"');
  });
});

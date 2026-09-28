import { buildingMatchColor, buildingMatchPercentLabel, isValidMatchRate } from "../utils/buildingMatchGradient.js";

describe("buildingMatchGradient", () => {
  test("0% maps to red", () => {
    expect(buildingMatchColor(0)).toBe("hsl(0, 65%, 45%)");
  });

  test("100% maps to green", () => {
    expect(buildingMatchColor(100)).toBe("hsl(120, 65%, 45%)");
  });

  test("50% maps to the mid hue", () => {
    expect(buildingMatchColor(50)).toBe("hsl(60, 65%, 45%)");
  });

  test("25% maps to a yellow-red hue", () => {
    expect(buildingMatchColor(25)).toBe("hsl(30, 65%, 45%)");
  });

  test("values below 0 and above 100 are clamped", () => {
    expect(buildingMatchColor(-10)).toBe("hsl(0, 65%, 45%)");
    expect(buildingMatchColor(175)).toBe("hsl(120, 65%, 45%)");
  });

  test("invalid rates return null and are not valid", () => {
    expect(buildingMatchColor(undefined)).toBeNull();
    expect(buildingMatchColor(null)).toBeNull();
    expect(buildingMatchColor("nope")).toBeNull();
    expect(isValidMatchRate("nope")).toBe(false);
  });

  test("percentage label rounds the rate", () => {
    expect(buildingMatchPercentLabel(66.6)).toBe("67%");
    expect(buildingMatchPercentLabel(0)).toBe("0%");
    expect(buildingMatchPercentLabel(100)).toBe("100%");
  });
});
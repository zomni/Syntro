module.exports = {
  testEnvironment: "node",
  roots: ["<rootDir>/src"],
  testMatch: ["**/__tests__/**/*.test.js"],
  clearMocks: true,
  // Los modulos del mapa se importan con cache-buster (?v=20260608b) para
  // webpack, pero el resolver de jest no lo acepta. Se lo quitamos aqui.
  moduleNameMapper: {
    "^(.+)\\?v=[0-9a-zA-Z]+$": "$1",
  },
};

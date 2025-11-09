export default {
  sources: [
    "tools/**/*.test.ts",
    "tools/**/*.wesl",
  ],
  destinations: [
    "*.md",
    "!node_modules/**",
  ],
};

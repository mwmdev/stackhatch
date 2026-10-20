import nextConfig from "eslint-config-next";

const eslintConfig = [
  {
    ignores: [
      ".next-playwright/**",
      "coverage/**",
      "test-results/**",
      "playwright-report/**",
      "operator/**",
    ],
  },
  ...nextConfig,
];

export default eslintConfig;

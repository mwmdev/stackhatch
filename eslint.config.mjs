import nextConfig from "eslint-config-next";

const eslintConfig = [
  { ignores: ["coverage/**", "test-results/**", "playwright-report/**", "operator/**"] },
  ...nextConfig,
];

export default eslintConfig;

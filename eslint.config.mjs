import nextConfig from "eslint-config-next";

const eslintConfig = [
  { ignores: ["coverage/**", "test-results/**", "playwright-report/**"] },
  ...nextConfig,
];

export default eslintConfig;

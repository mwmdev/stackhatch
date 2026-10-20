# Contributing to StackHatch

Thanks for helping make codebase architecture easier to understand.

## Before opening a change

- Search existing issues and keep a change focused on one problem.
- For user-facing work, describe the developer need and the observable outcome.
- Do not include private repositories, API keys, access tokens, or customer project content in issues, fixtures, screenshots, or commits.
- Preserve StackHatch's BYOK model and the distinction between repository evidence and architectural inference.

## Development workflow

1. Follow the setup in `README.md`.
2. Add or update tests with the implementation.
3. Run `npm test`, `npm run typecheck`, `npm run lint`, and `npm run build`.
4. Run `npm run test:e2e` for affected user journeys.
5. Open a concise pull request explaining the behavior change and verification performed.

For visual changes, verify keyboard use, reduced motion, light and dark themes, and narrow mobile layouts. Generated maps must remain understandable without relying on color alone.

By contributing, you agree that your contribution is licensed under the MIT License.

# Security Policy

## Reporting a vulnerability

Please do not open a public issue for a suspected vulnerability. Email `support@stackhatch.io` with:

- the affected route or component;
- steps to reproduce;
- the potential impact; and
- any suggested mitigation.

Do not include live API keys, session cookies, OAuth credentials, or private project content. You should receive an acknowledgement within seven days. Please allow time for investigation and a coordinated fix before public disclosure.

## Supported version

Security fixes are applied to the current version running at `stackhatch.io`. Older commits and self-hosted forks are not maintained by the StackHatch project.

## Data and credentials

StackHatch supports public GitHub repositories only. Anthropic API keys are encrypted at rest and are never returned to the browser after storage. Development authentication bypasses must never be enabled in production.

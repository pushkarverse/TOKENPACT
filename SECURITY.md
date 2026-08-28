# Security Policy

TokenPact moves money between autonomous agents, so we take security seriously —
even at the prototype stage.

## Supported versions

This project is pre-1.0 and experimental. Only the `main` branch is supported.

## Reporting a vulnerability

**Please do not open a public issue for security vulnerabilities.**

Instead, email the maintainers (see `README.md` → Team) with:

- a description of the issue and its impact,
- steps to reproduce (a proof of concept if possible),
- any suggested remediation.

We aim to acknowledge reports within 72 hours.

## Handling funds & keys

- **Never commit private keys, wallet seeds, or a real `.env`.** The `.gitignore`
  already excludes `.env`, `*.key`, `*.pem`, and `wallet.json`.
- Use **testnet keys and burner wallets** for all development. Run against
  `base-sepolia`, not mainnet, unless you know exactly what you are doing.
- The verifier executes **untrusted provider output**. Always run it inside the
  configured sandbox (`SANDBOX_DRIVER=docker` or stricter). Never set
  `SANDBOX_DRIVER=none` outside a throwaway local environment.

## Trust boundaries

- The **verifier is never paid by the provider** — this separation is core to the
  security model. Do not wire provider funds to the verifier.
- Treat every task spec, output artifact, and schema as **untrusted input**.

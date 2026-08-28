# Contributing to TokenPact

Thanks for your interest in TokenPact! This project started as a hackathon build
by Team TechCrunch and is under active, early-stage development. Contributions,
issues, and ideas are all welcome.

## Ground rules

- Be kind. See our [Code of Conduct](./CODE_OF_CONDUCT.md).
- Keep pull requests focused — one logical change per PR.
- Discuss large changes in an issue before writing a lot of code.

## Getting set up

TokenPact is a **pnpm workspace monorepo** targeting **Node.js 20+**.

```bash
# 1. Install pnpm if you don't have it
corepack enable && corepack prepare pnpm@latest --activate

# 2. Install all workspace dependencies
pnpm install

# 3. Copy the environment template and fill in testnet values
cp .env.example .env

# 4. Build everything
pnpm build

# 5. Run the end-to-end demo
pnpm demo
```

## Repository layout

| Path                  | What lives here                                              |
| --------------------- | ----------------------------------------------------------- |
| `apps/orchestrator`   | Escrow lifecycle + x402 settlement coordinator (HTTP API)   |
| `apps/verifier`       | Sandboxed verification service (compile, tests, schema)     |
| `agents/buyer`        | Example buyer agent (posts task + spec, funds escrow)       |
| `agents/provider`     | Example provider agent (produces the output)                |
| `packages/core`       | Shared domain types, task-spec schema, escrow state machine |
| `examples/`           | Runnable end-to-end demos                                    |
| `docs/`               | Architecture and design docs                                |

## Development workflow

1. Fork and branch from `main` using a descriptive name:
   `feat/on-chain-escrow`, `fix/verifier-timeout`, `docs/readme`.
2. Make your change. Add or update tests where it makes sense.
3. Run the checks locally before pushing:

   ```bash
   pnpm typecheck
   pnpm lint
   pnpm test
   ```

4. Open a pull request against `main` and fill in the template.

## Commit style

We use [Conventional Commits](https://www.conventionalcommits.org/):

```
feat(verifier): add p95 latency threshold check
fix(orchestrator): release escrow only after signed verification
docs(readme): clarify x402 settlement flow
```

## Security

Handling funds and running untrusted code demands care. Please read
[SECURITY.md](./SECURITY.md) before contributing to the payment or verifier
paths, and never commit secrets.

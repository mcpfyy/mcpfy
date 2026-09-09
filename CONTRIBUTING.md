# Contributing to mcpfy

Thanks for your interest in contributing to **mcpfy**!

mcpfy is a lightweight TypeScript SDK built around the official [Model Context Protocol TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk). We welcome bug fixes, improvements, documentation updates, examples, tests, and well-scoped feature proposals.

mcpfy is intentionally lightweight, so contributions should generally favor simple solutions and minimal API surface over additional abstractions.

If you're new to the project, this guide will walk you through everything from setting up the repository to opening a pull request.

---

## Before You Start

Before starting work:

1. Read the [README](./README.md).
2. Read the [TypeScript README](./typescript/README.md) if you're working on the TypeScript packages.
3. Search existing issues and pull requests to avoid duplicate work.
4. Check the [roadmap](./ROADMAP.md) for planned work.
5. For larger changes, open an issue before implementation so the scope and approach can be discussed.

For questions about the Model Context Protocol itself, refer to the [MCP specification](https://modelcontextprotocol.io) and the official [MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk).

mcpfy is a wrapper around the official SDK rather than a reimplementation of the MCP protocol.

---

## Repository Structure

mcpfy is a monorepo. The TypeScript workspace lives under `typescript/`.

```text
mcpfy/
├── assets/
├── python/
├── typescript/
│   ├── packages/
│   │   ├── mcpfy/               # Core SDK, published as mcpfy-sdk
│   │   ├── create-mcpfy-app/    # Project scaffolder
│   │   └── mcpfy-pulse/         # Optional telemetry
│   │
│   └── examples/
│       ├── hello-world/         # Basic MCP server example
│       └── widget-hello-world/  # Widget example
│
├── README.md
├── ROADMAP.md
├── CONTRIBUTING.md
└── LICENSE
```

### Where should I work?

| If you're changing...     | Work in...                               |
| ------------------------- | ---------------------------------------- |
| Core SDK                  | `typescript/packages/mcpfy`              |
| CLI / project scaffolding | `typescript/packages/create-mcpfy-app`   |
| Telemetry                 | `typescript/packages/mcpfy-pulse`        |
| Basic server example      | `typescript/examples/hello-world`        |
| Widget example            | `typescript/examples/widget-hello-world` |
| Python packages           | `python/`                                |

For most TypeScript contributions, commands should be run from the `typescript/` directory.

---

## Development Setup

### Requirements

For the TypeScript workspace, you need:

* **Node.js 20.19+** or **22.12+**
* **pnpm 10+**
* Git

Check your installed versions:

```bash
node --version
pnpm --version
git --version
```

### Clone the repository

Fork the repository on GitHub first if you are contributing from your own fork.

Then clone your fork:

```bash
git clone https://github.com/<your-username>/mcpfy.git
cd mcpfy
```

If you have permission to work directly with the repository, you can clone it directly:

```bash
git clone https://github.com/mcpfyy/mcpfy.git
cd mcpfy
```

### Install dependencies

Move into the TypeScript workspace:

```bash
cd typescript
pnpm install
```

### Build the workspace

```bash
pnpm build
```

### Run the tests

```bash
pnpm test
```

A fresh checkout should be able to install, build, and test successfully.

---

## Understanding the TypeScript Workspace

The TypeScript project uses a **pnpm workspace**.

The packages under `typescript/packages/` are developed together and may depend on one another.

For example, `mcpfy-sdk` uses functionality from `mcpfy-pulse`. Because of this, building the entire workspace from `typescript/` is the safest way to verify changes.

Prefer:

```bash
cd typescript
pnpm build
pnpm test
```

over building individual packages in isolation when your change involves workspace dependencies.

### Package-specific commands

You can also work on an individual package when appropriate.

#### mcpfy SDK

```bash
pnpm --filter mcpfy-sdk build
pnpm --filter mcpfy-sdk test
pnpm --filter mcpfy-sdk test:watch
```

#### create-mcpfy-app

```bash
pnpm --filter create-mcpfy-app build
pnpm --filter create-mcpfy-app dev -- my-test-app --no-install
```

#### mcpfy-pulse

```bash
pnpm --filter mcpfy-pulse build
pnpm --filter mcpfy-pulse test
```

---

## Branching

Do not work directly on `main`.

Create a new branch from the latest `main`:

```bash
git checkout main
git pull origin main
git checkout -b <branch-name>
```

Use a descriptive branch name.

Examples:

```text
feature/add-resource-subscriptions
feature/add-widget-support
fix/http-origin-validation
fix/client-session-error
docs/update-getting-started
test/add-http-roundtrip
refactor/simplify-client
chore/update-dependencies
```

Keep your branch focused on one change or one closely related group of changes.

---

## Making Changes

When making a contribution:

1. Keep the change focused.
2. Follow the existing code and project conventions.
3. Avoid unrelated refactoring.
4. Avoid unnecessary dependencies.
5. Add or update tests for changed behavior.
6. Update documentation when public behavior changes.
7. Update examples when the documented usage changes.
8. Clearly identify breaking changes.
9. Do not commit secrets or sensitive information.

Prefer the smallest implementation that correctly solves the problem.

### Keep changes focused

Avoid combining unrelated work.

For example, a PR that fixes an HTTP transport bug should not also:

* Rename unrelated files.
* Reformat the entire project.
* Upgrade unrelated dependencies.
* Refactor unrelated modules.

Small, focused PRs are easier to review, test, and merge.

---

## Code Style

mcpfy is written primarily in TypeScript.

Follow the conventions already established in the codebase:

* Use clear and descriptive names.
* Prefer simple control flow.
* Keep public APIs consistent and minimal.
* Follow existing module and import conventions.
* Avoid unnecessary comments.
* Add comments when they explain non-obvious behavior or important design decisions.
* Match the formatting of surrounding code.

The repository currently uses its existing TypeScript build and test tooling rather than separate `lint` or `typecheck` scripts.

Do not introduce a new formatter, linter, or validation system just for a small contribution without discussing it first.

---

## Testing

Testing is an important part of contributing to mcpfy.

Run:

```bash
cd typescript
pnpm build
pnpm test
```

Both commands should pass before opening a pull request.

### Prefer real behavior over mocked internals

When practical, tests should exercise the system the way a user would use it.

For SDK changes, the preferred pattern is:

```text
Start a real MCP server
        ↓
Connect a real MCP client
        ↓
Perform the operation
        ↓
Assert on the actual result
```

Avoid mocking the internals of the official MCP SDK when a real integration test is practical.

For example, the existing SDK tests include real transport round trips rather than simply mocking server/client behavior.

This makes tests more useful because they verify that the complete interaction actually works.

### When adding tests

A new test should ideally:

* Reproduce the bug before the fix, when applicable.
* Verify the expected behavior after the fix.
* Cover important edge cases.
* Avoid depending on implementation details unnecessarily.

If your change affects multiple transports or packages, test the relevant combinations where practical.

---

## Running Examples

Examples are useful for verifying that the public API works from a user's perspective.

The repository includes examples under:

```text
typescript/examples/
```

For example:

```bash
pnpm --filter @mcpfy-examples/hello-world start:stdio
```

and:

```bash
pnpm --filter @mcpfy-examples/hello-world start:http
```

If your change affects how a basic MCP server is created or used, update the relevant example as part of the contribution.

---

## Commit Guidelines

Use clear, descriptive commit messages.

The project commonly uses Conventional Commit-style prefixes:

```text
feat: add resource subscriptions
fix: handle invalid HTTP origin
docs: update authentication guide
test: add HTTP round-trip coverage
refactor: simplify client session handling
ci: update workflow configuration
chore: update dependencies
```

Common prefixes include:

| Prefix      | Use for                                     |
| ----------- | ------------------------------------------- |
| `feat:`     | New functionality                           |
| `fix:`      | Bug fixes                                   |
| `docs:`     | Documentation                               |
| `test:`     | Tests                                       |
| `refactor:` | Code restructuring without behavior changes |
| `ci:`       | CI/workflow changes                         |
| `chore:`    | Maintenance                                 |

Keep commits understandable and related to the work being done.

---

## Pull Request Process

When your changes are ready:

### 1. Run the checks

From `typescript/`:

```bash
pnpm build
pnpm test
```

### 2. Review your changes

Check:

```bash
git status
git diff
```

Make sure you have not accidentally committed:

* Secrets
* Credentials
* Environment files
* Generated files that should not be committed
* Unrelated changes

### 3. Push your branch

```bash
git push origin <branch-name>
```

### 4. Open a pull request

Open a PR against the repository's `main` branch.

Explain:

* What changed
* Why it changed
* How you tested it
* Any relevant issue
* Any breaking changes

For example:

```text
Fixes #123
```

when the PR completely resolves an issue.

### 5. Respond to review

Maintainers may request changes.

If changes are requested:

1. Make the requested updates on the same branch.
2. Run the tests again.
3. Push the new commits.
4. Reply to the review when appropriate.

You generally do not need to open a second PR for review changes.

### 6. After approval

Once the PR has passed the required checks and review, maintainers will handle the merge.

---

## Pull Request Checklist

Before opening your PR, check all of the following:

```text
- [ ] My change is focused and related to the PR.
- [ ] `pnpm build` passes from `typescript/`.
- [ ] `pnpm test` passes from `typescript/`.
- [ ] I added or updated tests where appropriate.
- [ ] Tests verify real behavior where practical.
- [ ] I updated relevant documentation.
- [ ] I updated relevant examples if necessary.
- [ ] I documented any breaking changes.
- [ ] I did not add unnecessary dependencies.
- [ ] I did not commit secrets or sensitive information.
- [ ] I reviewed my final diff.
```

---

## Reporting Bugs

Before reporting a bug:

1. Search existing issues.
2. Make sure you are using a supported Node.js version.
3. Make sure dependencies are installed correctly.
4. Check whether the behavior is specific to mcpfy or comes from the underlying MCP SDK.
5. Try to create a minimal reproduction.

A useful bug report should include:

* What you expected to happen.
* What actually happened.
* Package name and version.
* Node.js version.
* Transport being used, if relevant.
* MCP client being used, if relevant.
* Relevant error messages or logs.
* Minimal reproduction code or a repository link.

### Minimal reproductions

A minimal reproduction should contain only what is necessary to demonstrate the problem.

For example:

```text
Create server
    ↓
Register affected feature
    ↓
Connect client
    ↓
Perform operation
    ↓
Show unexpected result
```

The smaller the reproduction, the easier it is to investigate.

**Never include API keys, passwords, access tokens, private keys, or other secrets in an issue.**

---

## Feature Requests

Feature requests are welcome.

Before proposing a larger feature:

* Check `ROADMAP.md`.
* Search existing issues and pull requests.
* Explain the problem you are trying to solve.
* Explain why the current API is insufficient.
* Describe the proposed behavior.
* Consider whether the feature can be implemented without unnecessary API complexity.

For changes that introduce or significantly modify public APIs, open an issue before implementation whenever possible.

This allows the maintainers to discuss the design before implementation begins.

---

## Documentation Contributions

Documentation is part of the project and should stay synchronized with the implementation.

When changing public behavior:

* Update the relevant documentation.
* Keep code examples accurate.
* Test examples when practical.
* Update examples when the public API changes.
* Check links when moving or renaming documentation.
* Keep terminology consistent with mcpfy and the official MCP documentation.
* Do not document unreleased behavior as if it were already available.

If an API change affects users, documentation should normally be part of the same pull request.

---

## Breaking Changes

Changes to public APIs require additional care.

If your contribution introduces a breaking change, clearly explain:

* What is changing.
* Why it is changing.
* Who is affected.
* What existing users need to change.
* Whether a migration path is available.

Do not silently introduce breaking behavior or compatibility shims without discussion.

For significant API changes, open an issue before implementation.

---

## Dependencies

Avoid adding dependencies unless there is a clear technical reason.

Before introducing a dependency, consider:

* Can the functionality reasonably be implemented using existing dependencies?
* Is the dependency actively maintained?
* Does it increase package size?
* Does it affect supported Node.js versions?
* Does it introduce additional security or maintenance concerns?

If you add a dependency, explain why it is necessary in the pull request.

---

## Telemetry Contributions

If you contribute to `mcpfy-pulse`, take extra care around data handling.

Telemetry should not transmit user-provided argument values or resource content.

If your change affects telemetry:

* Explain what data is being collected.
* Add tests for the behavior.
* Verify that user content is not unintentionally transmitted.
* Clearly describe telemetry-related changes in the pull request.

If a telemetry change introduces a new field, the PR should explain what that field contains and why it is safe.

---

## Security

Never commit:

* API keys
* Access tokens
* Passwords
* Private keys
* Credentials
* `.env` files containing secrets
* Other sensitive information

If you accidentally commit a secret, do not simply delete it in a later commit. Treat it as compromised and rotate/revoke it as appropriate.

For security vulnerabilities, do not disclose sensitive details in a public issue. Follow the repository's security-reporting process instead.

---

## Troubleshooting

### `pnpm` is not recognized

Install pnpm and verify:

```bash
pnpm --version
```

The TypeScript workspace requires pnpm 10+.

### Node.js version errors

Check:

```bash
node --version
```

Use Node.js **20.19+** or **22.12+**.

### Workspace dependency errors

Make sure you are working from:

```text
mcpfy/typescript/
```

Then run:

```bash
pnpm install
pnpm build
```

When packages depend on one another, prefer building the workspace rather than an individual package in isolation.

### Tests fail after pulling changes

Try reinstalling dependencies:

```bash
pnpm install
pnpm build
pnpm test
```

If the problem remains, check the test output and search existing issues before opening a new bug report.

### You are unsure where to make a change

Start with the package most closely related to the behavior:

```text
SDK behavior        → typescript/packages/mcpfy
Scaffolding / CLI   → typescript/packages/create-mcpfy-app
Telemetry           → typescript/packages/mcpfy-pulse
Basic example       → typescript/examples/hello-world
Widget example      → typescript/examples/widget-hello-world
```

If you're still unsure, open an issue and explain what you're trying to change.

---

## Keeping Your Branch Updated

If `main` has changed significantly while your PR is under review, maintainers may ask you to update your branch.

You can update it with:

```bash
git fetch origin
git checkout main
git pull origin main
git checkout <your-branch>
git merge main
```

Resolve any conflicts, then run:

```bash
cd typescript
pnpm build
pnpm test
```

Push the updated branch:

```bash
git push origin <your-branch>
```

If you're not comfortable resolving merge conflicts, ask for help in the PR rather than guessing.

---

## Good Contributions

A good contribution is generally:

* Small and focused.
* Easy to understand.
* Covered by appropriate tests.
* Consistent with the existing API.
* Documented when user-facing.
* Free of unrelated changes.
* Easy for another maintainer to review.

When deciding between two approaches, prefer the one that solves the problem with less complexity.

---

## Code of Conduct

Please keep all project discussions and reviews respectful and constructive.

Contributors should help maintain an open and welcoming environment for everyone participating in the project.

By participating in the project, you agree to follow the repository's [Code of Conduct](./CODE_OF_CONDUCT.md) if one is present.

---

## License

By contributing to mcpfy, you agree that your contributions will be licensed under the repository's [MIT License](./LICENSE).

---

## Questions?

If you're unsure about something:

1. Check the README and documentation.
2. Search existing issues and pull requests.
3. Check the relevant package and tests.
4. Open an issue if you still need clarification.

When asking for help, include enough context for someone else to reproduce or understand the problem.

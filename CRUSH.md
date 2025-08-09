DevOps AI Toolkit – CRUSH quick reference

Commands
- Install deps: npm ci
- Build: npm run build (prod: npm run build:prod, dev: npm run build:dev, watch: npm run build:watch)
- Lint/format: npm run lint; npm run format
- Test all: npm test (verbose: npm run test:verbose, watch: npm run test:watch, coverage: npm run test:coverage)
- Run a single test file: npm test -- tests/core/schema.test.ts
- Run a single test by name: npx jest tests/core/schema.test.ts -t "should parse schema" (use -i to run in-band if needed)
- Start MCP server (after build): npm run start:mcp

Code style
- Language/TS config: strict mode enabled (noImplicitAny, strictNullChecks, noImplicitReturns). Module: commonjs; target/lib: ES2022; Node >= 18
- Formatting (Prettier): semi: true, singleQuote: true, trailingComma: es5, printWidth: 80, tabWidth: 2
- ESLint: @typescript-eslint; no-unused-vars handled by TS rule; prefix intentionally unused args with _; avoid console.* (warns) – prefer structured logger
- Imports: Node resolution, no path aliases; group external → internal; prefer named imports; keep relative paths stable
- Types: favor explicit types for public APIs; avoid any; use interfaces/types for data shapes; mark values readonly when applicable
- Naming: camelCase for vars/functions, PascalCase for types/enums/classes, UPPER_SNAKE_CASE for constants; file names kebab-case .ts
- Errors/logging: use src/core/error-handling.ts (ErrorHandler.withErrorHandling, AppError, ConsoleLogger). Never log secrets; map to MCP errors where needed
- Prompts: NEVER hard-code AI prompts. Load from prompts/*.md using FS as in CLAUDE.md (see docs/) and replace {variables}
- Tests: Jest + ts-jest. Place tests in tests/ mirroring src/. Mocks via tests/__mocks__ with moduleNameMapper (e.g., @kubernetes/client-node)

Notes
- Cursor/Copilot rules: none detected (.cursor/rules, .cursorrules, .github/copilot-instructions.md). If added, mirror key rules here
- .crush/ directory is already ignored in .gitignore
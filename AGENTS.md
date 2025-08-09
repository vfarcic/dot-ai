AGENTS GUIDE (for agentic coding in this repo)

- Tooling/versions: Node >=18, TypeScript 5, Jest + ts-jest, ESLint, Prettier
- Install: npm ci
- Build: npm run build (prod: npm run build:prod; watch: npm run build:watch)
- Lint/Format: npm run lint; auto-format TS with npm run format
- Test (all): npm test (prebuild runs automatically)
  - Note: npm test performs the build automatically; you do NOT need to run npm run build separately.
  - Note: You generally do not need to run npm ci before every test run; use it only to (re)install dependencies.
- Test (verbose/watch): npm run test:verbose; npm run test:watch
- Test (coverage): npm run test:coverage
- Test (single file): npm test -- tests/path/to/file.test.ts
- Test (single name): npm test -- -t "test name substring"

Code style (TS strict):

- Imports/exports: use ES module syntax; prefer named imports; keep local relative paths; do not hard-code AI prompts—load from prompts/\*.md
- Formatting: follow .prettierrc (singleQuote, semi, width 80, trailingComma es5, tabWidth 2); run npm run format
- Linting: follow .eslintrc; no-unused-vars via @typescript-eslint/no-unused-vars (prefix unused args with \_); no-console (warn) — prefer Logger
- Types: strict=true, noImplicitAny, strictNullChecks; avoid any; define interfaces/types; use enums where appropriate; explicit return types for public APIs
- Naming: PascalCase for classes/enums; camelCase for functions/vars; UPPER_SNAKE_CASE for constants
- Errors/logging: use ErrorHandler/AppError/ConsoleLogger; avoid throwing raw Error; wrap ops with ErrorHandler.withErrorHandling; map to MCP via ErrorHandler.toMcpError when needed
- Tests: place in tests/ mirroring src/; Jest config mocks @kubernetes/client-node; keep unit tests deterministic; prefer dependency injection for loggers/clients
- CI expectations: lint → build → test (see .github/workflows/ci.yml); security audit via npm audit
- Cursor/Copilot rules: none found (no .cursor/ or copilot-instructions present)

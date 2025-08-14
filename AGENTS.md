AGENTS GUIDE (for agentic coding in this repo)

- Tooling: Node >=18, TypeScript 5, Jest + ts-jest, ESLint, Prettier
- Install: npm ci
- Build: npm run build (prod: npm run build:prod; watch: npm run build:watch)
- Lint/Format: npm run lint; auto-format with npm run format
- Test (all): npm test (build runs automatically)
- Test (verbose/watch/coverage): npm run test:verbose; npm run test:watch; npm run test:coverage
- Test (single file): npm test -- tests/path/to/file.test.ts
- Test (single test name): npm test -- -t "name substring"

Code style (TS strict):

- Imports: ES modules; prefer named imports; keep local relative paths; never hard-code prompts—load from prompts/\*.md
- Formatting: follow .prettierrc (singleQuote, semi, printWidth 80, trailingComma es5, tabWidth 2)
- Linting: follow .eslintrc; no-unused-vars via @typescript-eslint/no-unused-vars (prefix unused args with \_); no-console (warn)—use Logger
- Types: strict, noImplicitAny, strictNullChecks; avoid any; define interfaces/types; enums when appropriate; explicit return types for public APIs
- Naming: PascalCase (classes/enums), camelCase (functions/vars), UPPER_SNAKE_CASE (consts)
- Errors/logging: use ErrorHandler/AppError/ConsoleLogger; avoid raw Error; wrap ops with ErrorHandler.withErrorHandling; map to MCP with ErrorHandler.toMcpError
- Tests: mirror src/ in tests/; deterministic; mock @kubernetes/client-node (see Jest config); prefer DI for loggers/clients
- CI: lint → build → test (see .github/workflows/ci.yml); run npm audit
- Cursor/Copilot rules: none present (.cursor/ or .github/copilot-instructions.md not found)

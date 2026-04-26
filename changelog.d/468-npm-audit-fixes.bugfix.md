### Resolve npm audit advisories (#468)

Updated transitive dependencies via `npm audit fix` (hono, dompurify, lodash-es, postcss, protobufjs, vite, and others) and bumped direct `uuid` from 13 to 14 to address GHSA-w5hq-g745-h8pq. Added an `.nsprc` exception for the same advisory via the `mermaid > uuid` transitive path, which has no upstream fix yet; the vulnerable code path (passing a `buf` argument to `uuidv5`) is not used in this codebase.

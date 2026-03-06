## Fix agentic-tools arm64 Docker image build failure

The agentic-tools plugin Docker image now builds reliably for both amd64 and arm64 architectures. Previously, `npm ci` ran inside the Docker build under QEMU arm64 emulation, which could hang or crash with "Illegal instruction". The build now runs `npm ci` and TypeScript compilation on the native CI runner, then copies the pre-built artifacts into the Docker image. All agentic-tools dependencies are pure JavaScript, so the pre-built output works on both architectures.

## Plugin Readiness Probe Timing

The agentic-tools plugin readiness probe `initialDelaySeconds` is now 30 seconds (previously 5 seconds). The aggressive 5-second delay caused spurious readiness probe failures during pod startup, triggering unnecessary rolling restarts when the container needed more time to initialize.

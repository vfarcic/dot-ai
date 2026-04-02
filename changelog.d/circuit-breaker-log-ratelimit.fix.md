### Circuit Breaker Log Volume Reduction

Rate-limited circuit breaker WARN logs to prevent log spam during sustained outages (~2K lines/min reduced to ~2/min). Failure warnings are now emitted at most once per 30 seconds with a count of suppressed messages. Also rate-limited the batch embedding fallback warning in EmbeddingService.

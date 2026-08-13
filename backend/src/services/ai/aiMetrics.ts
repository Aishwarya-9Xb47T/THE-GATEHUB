const metrics = {
  requests: 0,
  successes: 0,
  totalDurationMs: 0,
  tokenEstimate: 0,
};

export function recordAiRequest(durationMs: number, tokens?: number, success = true) {
  metrics.requests++;
  if (success) metrics.successes++;
  metrics.totalDurationMs += durationMs;
  metrics.tokenEstimate += tokens ?? Math.round(durationMs / 10);
}

export function getAiBenchmark() {
  const avg = metrics.requests ? Math.round(metrics.totalDurationMs / metrics.requests) : 0;
  return {
    requests: metrics.requests,
    successes: metrics.successes,
    successRate: metrics.requests ? Math.round((metrics.successes / metrics.requests) * 100) : 100,
    avgResponseMs: avg,
    tokenEstimate: metrics.tokenEstimate,
  };
}

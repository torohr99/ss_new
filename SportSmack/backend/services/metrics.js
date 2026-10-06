const metrics = {
  startedAt: new Date(),

  requests: 0,
  errors: 0,

  statusCodes: {},

  totalDurationMs: 0,
  slowRequests: 0,

  recordRequest(
    statusCode,
    durationMs = 0
  ) {
    this.requests += 1;

    const key = String(statusCode);

    this.statusCodes[key] =
      (this.statusCodes[key] || 0) + 1;

    if (statusCode >= 500) {
      this.errors += 1;
    }

    this.totalDurationMs +=
      Number.isFinite(durationMs)
        ? durationMs
        : 0;

    if (durationMs >= 500) {
      this.slowRequests += 1;
    }
  },

  snapshot() {
    const averageDurationMs =
      this.requests > 0
        ? this.totalDurationMs /
          this.requests
        : 0;

    const errorRate =
      this.requests > 0
        ? this.errors /
          this.requests
        : 0;

    const slowRequestRate =
      this.requests > 0
        ? this.slowRequests /
          this.requests
        : 0;

    return {
      startedAt:
        this.startedAt.toISOString(),

      uptimeSeconds:
        Math.round(
          process.uptime()
        ),

      requests:
        this.requests,

      errors:
        this.errors,

      errorRate,

      slowRequests:
        this.slowRequests,

      slowRequestRate,

      averageDurationMs,

      statusCodes:
        { ...this.statusCodes },

      memory:
        process.memoryUsage()
    };
  }
};

module.exports = metrics;

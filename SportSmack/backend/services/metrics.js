const metrics = {
  startedAt: new Date(),
  requests: 0,
  errors: 0,
  statusCodes: {},

  recordRequest(statusCode) {
    this.requests += 1;

    const key = String(statusCode);
    this.statusCodes[key] = (this.statusCodes[key] || 0) + 1;

    if (statusCode >= 500) {
      this.errors += 1;
    }
  },

  snapshot() {
    return {
      startedAt: this.startedAt.toISOString(),
      uptimeSeconds: Math.round(process.uptime()),
      requests: this.requests,
      errors: this.errors,
      statusCodes: { ...this.statusCodes },
      memory: process.memoryUsage()
    };
  }
};

module.exports = metrics;

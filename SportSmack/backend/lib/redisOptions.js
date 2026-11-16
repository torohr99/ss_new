/**
 * Shared ioredis connection policy for API, Socket.IO, and Worker clients.
 * Commands fail promptly during outages while clients continue reconnecting.
 */
module.exports = function redisOptions() {
  return {
    maxRetriesPerRequest: 1,
    connectTimeout: 5000,
    commandTimeout: 5000,
    enableReadyCheck: true,
    lazyConnect: false,
    family: 0,
    retryStrategy: times => Math.min(times * 250, 2000)
  };
};

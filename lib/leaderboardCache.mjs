const DEFAULT_TTL_MS = 30_000;
const MAX_ENTRIES = 100;
const entries = new Map();
const refreshes = new Map();

function refresh(key, loader) {
  const existing = refreshes.get(key);
  if (existing) return existing;

  const promise = Promise.resolve()
    .then(loader)
    .then((value) => {
      entries.set(key, { value, createdAt: Date.now() });
      while (entries.size > MAX_ENTRIES) {
        entries.delete(entries.keys().next().value);
      }
      return value;
    })
    .finally(() => {
      refreshes.delete(key);
    });

  refreshes.set(key, promise);
  return promise;
}

/**
 * Return a cached leaderboard snapshot and coalesce concurrent refreshes.
 * Expired snapshots are served immediately while one refresh runs in the
 * background, so a slow database sort does not block a user's reply twice.
 *
 * The numeric TTL form remains supported for existing commands.
 */
export async function getCachedLeaderboard(key, loader, ttlOrOptions = DEFAULT_TTL_MS) {
  const ttlMs = typeof ttlOrOptions === "number"
    ? ttlOrOptions
    : (ttlOrOptions?.ttlMs ?? DEFAULT_TTL_MS);
  const cached = entries.get(key);

  if (cached && Date.now() - cached.createdAt < ttlMs) {
    return cached.value;
  }

  if (cached) {
    void refresh(key, loader).catch(() => {});
    return cached.value;
  }

  return refresh(key, loader);
}
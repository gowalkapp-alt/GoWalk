let statsModuleCache = null;
export async function loadStatsModuleSafely() {
  if (statsModuleCache) return statsModuleCache;
  statsModuleCache = await import('../stats.js');
  return statsModuleCache;
}

let statsModuleCache = null;
export async function loadStatsModuleSafely() {
  if (statsModuleCache) return statsModuleCache;
  try {
    statsModuleCache = await import('../stats.js');
    return statsModuleCache;
  } catch (err1) {
    statsModuleCache = await import('../Stats.js');
    return statsModuleCache;
  }
}

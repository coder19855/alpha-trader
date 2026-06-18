/** Human-readable elapsed time for benchmark progress and reports. */
export function formatBenchmarkElapsed(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  if (totalSec < 60) return `${totalSec}s`;

  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  if (min < 60) {
    return sec > 0 ? `${min}m ${sec}s` : `${min}m`;
  }

  const hr = Math.floor(min / 60);
  const remMin = min % 60;
  return remMin > 0 ? `${hr}h ${remMin}m` : `${hr}h`;
}

export function createBenchmarkTimer(startedAtMs = Date.now()) {
  return {
    startedAtMs,
    elapsedMs: () => Date.now() - startedAtMs,
    label: () => formatBenchmarkElapsed(Date.now() - startedAtMs),
  };
}
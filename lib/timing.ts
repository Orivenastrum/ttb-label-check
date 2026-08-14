// Stage timer (R2). Exists before extract.ts does, per the build order.
export type StageTimings = Record<string, number>;

export function createTimer() {
  const timings: StageTimings = {};
  return {
    async stage<T>(name: string, fn: () => Promise<T>): Promise<T> {
      const start = Date.now();
      try {
        return await fn();
      } finally {
        timings[name] = Date.now() - start;
      }
    },
    timings,
  };
}

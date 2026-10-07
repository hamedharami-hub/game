export type GraphicsQualityPreference = 'auto' | 'low';
export type GraphicsQuality = 'low' | 'high';

export interface GraphicsCapabilities {
  deviceMemory?: unknown;
  hardwareConcurrency?: unknown;
}

export function readGraphicsQualityPreference(readValue: () => unknown): GraphicsQualityPreference {
  try { return readValue() === 'low' ? 'low' : 'auto'; } catch { return 'auto'; }
}

export function resolveGraphicsQuality(value: unknown, capabilities?: GraphicsCapabilities | null): GraphicsQuality {
  if (value === 'low') return 'low';
  const memory = usable(capabilities?.deviceMemory);
  const cores = usable(capabilities?.hardwareConcurrency);
  return memory === undefined && cores === undefined || memory !== undefined && memory <= 4 || cores !== undefined && cores <= 4
    ? 'low' : 'high';
}

function usable(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : undefined;
}

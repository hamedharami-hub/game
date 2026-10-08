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
  // Four modest cores still deserve daylight and shade. Only very small
  // phones drop to the flat low-power look unless the player asks for it.
  return memory !== undefined && memory <= 2 ? 'low' : 'high';
}

function usable(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : undefined;
}

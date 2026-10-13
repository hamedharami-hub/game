export function controlKey(event: Pick<KeyboardEvent, 'code' | 'key'>): string {
  const physical: Record<string, string> = { KeyW: 'w', KeyA: 'a', KeyS: 's', KeyD: 'd', KeyF: 'f', KeyH: 'h', KeyE: 'e', KeyR: 'r', KeyC: 'c', KeyQ: 'q' };
  return physical[event.code] ?? (event.key.startsWith('Arrow') ? event.key : event.key.toLowerCase());
}
export const movementKeys = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'w', 'a', 's', 'd'];
export function focusableElements(root: HTMLElement): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>('button, input, select, textarea, a[href], [tabindex]')]
    .filter(item => !item.matches(':disabled, [tabindex="-1"]') && item.getClientRects().length > 0);
}

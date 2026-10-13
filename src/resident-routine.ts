export type ResidentActivity = 'flowers' | 'social' | 'rest';
/** Short local routines follow active session time, never wall-clock or saves. */
export function residentRoutine(index: number, seconds: number) {
  const time = Number.isFinite(seconds) ? Math.max(0, seconds) : 0;
  const person = Number.isFinite(index) ? Math.max(0, Math.floor(index)) : 0;
  const cycle = (time + person * 17) % 180;
  const leg = Math.floor(cycle / 60);
  const progress = cycle % 60;
  const stops = [{ x: 0, z: 0 }, { x: 1.8, z: -.7 }, { x: .6, z: 1.2 }];
  const from = stops[leg], to = stops[(leg + 1) % 3];
  const blend = Math.min(1, progress / 12);
  return { x: from.x + (to.x - from.x) * blend, z: from.z + (to.z - from.z) * blend,
    heading: Math.atan2(to.x - from.x, to.z - from.z), moving: progress < 12,
    activity: (['flowers', 'social', 'rest'] as const)[leg] };
}
export function residentGreeting(activity: ResidentActivity, hasVases: boolean, hasHybrids: boolean): string {
  if (hasHybrids) return '«گل‌های پیوندی‌ات را دیدم؛ ترکیب رنگشان به دشت جان داده.»';
  if (hasVases) return '«گلدان‌های تازه‌ات به دشت رنگ داده‌اند.»';
  return { flowers: '«دارم به گل‌ها سر می‌زنم؛ دو گل شکفتهٔ سازگار را کنار هم پیوند بزن.»',
    social: '«کمی کنار هم گپ می‌زنیم؛ خوش آمدی همسایه.»',
    rest: '«وقت یک مکث آرام است؛ کنار همراهت منظره را تماشا کن.»' }[activity];
}

import { decodeSave, type State } from './state.ts';

export function importSaveFile(raw: string): State {
  if (raw.length > 1_000_000) throw new Error('فایل ذخیره بیش از حد بزرگ است.');
  let value;
  try { value = JSON.parse(raw); } catch { throw new Error('فایل JSON معتبر نیست.'); }
  if (!value || value.version !== 1 || !Array.isArray(value.collected) || !Array.isArray(value.plants)
    || value.collected.some((item: unknown) => typeof item !== 'string' || !['seed', 'crystal', 'feather'].includes(item))) throw new Error('این فایل ذخیرهٔ کاروان رؤیاها نیست.');
  const decoded = decodeSave(raw);
  if (decoded.plants.length !== value.plants.length
    || decoded.landscapePlacements.length !== (value.landscapePlacements?.length ?? 0)
    || decoded.life.vases.length !== (value.life?.vases?.length ?? 0)) throw new Error('فایل دارای گیاه، گلدان یا سازهٔ نامعتبر است؛ بازی فعلی تغییر نکرد.');
  return decoded;
}
export function downloadFile(contents: Blob, filename: string) {
  const url = URL.createObjectURL(contents);
  const link = document.createElement('a');
  link.href = url; link.download = filename;
  document.body.append(link); link.click(); link.remove();
  // Slow/mobile browsers may consume a large PNG asynchronously.
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

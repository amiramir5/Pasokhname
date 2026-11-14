import { AIModelPreference } from '../types/exam';

/**
 * فقط مدل‌هایی که روی پلن رایگان Gemini API قابل استفاده‌اند و در عمل پاسخ می‌دهند.
 * مدل‌های Argon و Carbon (و همچنین 3.8 Flash) حذف شده‌اند چون فقط با کلید پرداختی کار می‌کنند.
 *
 * - gemini-3.5-flash-lite: سریع‌ترین و ارزان‌ترین؛ پیش‌فرض استخراج کلید پاسخنامه
 * - gemini-3.6-flash:      متعادل؛ پیش‌فرض تشخیص باکس سوالات و OCR صفحات
 * - gemini-4-hydrogen:     دقیق‌تر ولی کندتر؛ فقط به‌عنوان فال‌بک کیفیت
 */
export const CHEAPEST_MODEL = 'gemini-3.5-flash-lite';
export const FAST_MODEL = 'gemini-3.6-flash';
export const STRONG_MODEL = 'gemini-4-hydrogen';

export const ALLOWED_MODELS: AIModelPreference[] = [
  'gemini-3.5-flash-lite',
  'gemini-3.6-flash',
  'gemini-4-hydrogen',
];

export const ALLOWED_MODEL_SET = new Set<string>(ALLOWED_MODELS);

export const MODEL_LABELS: Record<AIModelPreference, string> = {
  auto: 'هوشمند — شروع با سریع‌ترین مدل و ارتقای خودکار در صورت نیاز',
  'gemini-3.5-flash-lite': 'Gemini 3.5 Flash-Lite — سریع‌ترین و سبک‌ترین (رایگان)',
  'gemini-3.6-flash': 'Gemini 3.6 Flash — متعادل و دقیق (رایگان)',
  'gemini-4-hydrogen': 'Gemini 4 Hydrogen — دقیق‌تر ولی کندتر (رایگان)',
};

/** مدل پیش‌فرض برای استخراج پاسخنامه: ارزان‌ترین مدل مناسب OCR */
export function resolveAnswerKeyModel(preference?: AIModelPreference | string): string {
  if (!preference || preference === 'auto' || !ALLOWED_MODEL_SET.has(preference)) {
    return CHEAPEST_MODEL;
  }
  return preference;
}

/** مدل پیش‌فرض برای تشخیص باکس سوالات */
export function resolveVisionModel(preference?: AIModelPreference | string): string {
  if (!preference || preference === 'auto' || !ALLOWED_MODEL_SET.has(preference)) {
    return FAST_MODEL;
  }
  return preference;
}

export function isAllowedModel(model: string | undefined): model is AIModelPreference {
  return Boolean(model && ALLOWED_MODEL_SET.has(model));
}

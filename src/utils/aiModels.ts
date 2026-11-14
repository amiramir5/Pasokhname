import { AIModelPreference } from '../types/exam';

/**
 * نام‌گذاری مدل‌ها بر اساس آخرین نسخه‌های رسمی Gemini API (نسل ۴ + شاخه پایدار ۳):
 * - gemini-4-hydrogen: مدل سریع و کم‌هزینه نسل ۴ (مناسب OCR صفحات و برش سوال)
 * - gemini-4-argon:   استدلال دقیق‌تر نسل ۴ با هزینه کمتر از Carbon (مناسب صفحات پیچیده و فال‌بک)
 * - gemini-4-carbon:  قوی‌ترین مدل استدلالی نسل ۴ (فقط برای سخت‌ترین صفحات)
 * - gemini-3.5-flash-lite: ارزان‌ترین و سریع‌ترین مدل پایدار (مناسب استخراج سبک کلید پاسخنامه)
 * - gemini-3.6-flash / gemini-3.8-flash: مدل‌های پایدار نسل قبل
 */
export const FAST_MODEL = 'gemini-4-hydrogen';
export const STRONG_MODEL = 'gemini-4-argon';
export const CHEAPEST_MODEL = 'gemini-3.5-flash-lite';
export const MAX_MODEL = 'gemini-4-carbon';
export const PREVIOUS_STRONG_MODEL = 'gemini-3.8-flash';
export const PREVIOUS_BALANCED_MODEL = 'gemini-3.6-flash';

export const ALLOWED_MODELS: AIModelPreference[] = [
  'gemini-4-hydrogen',
  'gemini-4-argon',
  'gemini-4-carbon',
  'gemini-3.5-flash-lite',
  'gemini-3.6-flash',
  'gemini-3.8-flash',
];

export const ALLOWED_MODEL_SET = new Set<string>(ALLOWED_MODELS);

export const MODEL_LABELS: Record<AIModelPreference, string> = {
  auto: 'هوشمند (شروع سریع و ارتقای خودکار در صورت نیاز)',
  'gemini-4-hydrogen': 'Gemini 4 Hydrogen — سریع و مقرون‌به‌صرفه (پیشنهادی)',
  'gemini-4-argon': 'Gemini 4 Argon — استدلال دقیق‌تر با مصرف متعادل',
  'gemini-4-carbon': 'Gemini 4 Carbon — حداکثر دقت برای صفحات بسیار پیچیده',
  'gemini-3.5-flash-lite': 'Gemini 3.5 Flash-Lite — ارزان‌ترین و سبک‌ترین',
  'gemini-3.6-flash': 'Gemini 3.6 Flash — نسل قبل، متعادل',
  'gemini-3.8-flash': 'Gemini 3.8 Flash — نسل قبل، پایدار',
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

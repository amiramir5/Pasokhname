import { OptionChoice } from '../types/exam';

const FARSI_DIGITS = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];

/**
 * تبدیل تمام اعداد انگلیسی و عربی به اعداد فارسی
 */
export function toFarsiDigits(value: string | number | undefined | null): string {
  if (value === undefined || value === null) return '';
  const str = String(value);
  return str
    .replace(/[0-9]/g, (d) => FARSI_DIGITS[Number(d)])
    .replace(/[٠-٩]/g, (d) => FARSI_DIGITS[d.charCodeAt(0) - 1632]);
}

/**
 * تبدیل اعداد فارسی و عربی داخل رشته به انگلیسی جهت محاسبات ریاضی
 */
export function fromFarsiDigits(value: string): string {
  if (!value) return '';
  return value
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 1776))
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 1632));
}

/**
 * پارس کردن عدد صحیح از ورودی که ممکن است عدد فارسی یا انگلیسی باشد
 */
export function parseFarsiInt(value: string, fallback = 0): number {
  const normalized = fromFarsiDigits(value).replace(/[^\d-]/g, '');
  const parsed = parseInt(normalized, 10);
  return Number.isNaN(parsed) ? fallback : parsed;
}

/**
 * فرمت زمان (ثانیه) به MM:SS یا HH:MM:SS با ارقام فارسی
 */
export function formatFarsiTimer(totalSeconds: number): string {
  const safeSeconds = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const seconds = safeSeconds % 60;

  const pad = (n: number) => String(n).padStart(2, '0');
  if (hours > 0) {
    return toFarsiDigits(`${pad(hours)}:${pad(minutes)}:${pad(seconds)}`);
  }
  return toFarsiDigits(`${pad(minutes)}:${pad(seconds)}`);
}

/**
 * فرمت درصد به فارسی (مثلاً ۸۵.۴٪ یا -۱۲.۳٪)
 */
export function formatFarsiPercent(value: number, decimals = 1): string {
  const rounded = Number(value.toFixed(decimals));
  const formatted = Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(decimals);
  // استفاده از ممیز فارسی برای خوانایی بهتر
  return `${toFarsiDigits(formatted).replace('.', '٫')}٪`;
}

/**
 * برچسب گزینه‌ها بر اساس تنظیمات (۱ ۲ ۳ ۴ یا الف ب ج د)
 */
export function getOptionLabel(option: OptionChoice, style: 'numeric' | 'alphabetic' = 'numeric'): string {
  if (style === 'alphabetic') {
    const map: Record<OptionChoice, string> = {
      1: 'الف',
      2: 'ب',
      3: 'ج',
      4: 'د',
    };
    return map[option];
  }
  return toFarsiDigits(option);
}

/**
 * پارسر هوشمند محلی برای متن کلید پاسخنامه (پشتیبان و مکمل هوش مصنوعی)
 * پشتیبانی از فرمت‌های:
 * "1-3, 2-1, 3-4" یا "۱: الف، ۲: ج" یا خطوط مجزا یا رشته پشت سر هم مثل "31421234"
 */
export function parseAnswerKeyFromTextLocal(
  rawText: string,
  maxQuestions = 200
): Record<number, OptionChoice> {
  const result: Record<number, OptionChoice> = {};
  const normalized = fromFarsiDigits(rawText.trim());
  if (!normalized) return result;

  const mapLetterToOption = (token: string): OptionChoice | null => {
    const t = token.trim().toLowerCase();
    if (t === '1' || t === 'الف' || t === 'a') return 1;
    if (t === '2' || t === 'ب' || t === 'b') return 2;
    if (t === '3' || t === 'ج' || t === 'c') return 3;
    if (t === '4' || t === 'د' || t === 'd') return 4;
    return null;
  };

  // حالت ۱: جفت‌های شماره سوال و گزینه، مثل "1-3" یا "1: الف" یا "سوال 1 گزینه 3"
  const pairRegex = /(?:سوال\s*)?(\d{1,3})\s*[-:=.)،,\s]+\s*(?:گزینه\s*)?([1-4]|الف|ب|ج|د|[a-dA-D])(?![0-9])/g;
  let match: RegExpExecArray | null;
  let matchedCount = 0;

  while ((match = pairRegex.exec(normalized)) !== null) {
    const qNum = parseInt(match[1], 10);
    const opt = mapLetterToOption(match[2]);
    if (qNum >= 1 && qNum <= maxQuestions && opt) {
      result[qNum] = opt;
      matchedCount++;
    }
  }

  if (matchedCount > 0) {
    return result;
  }

  // حالت ۲: لیست گزینه‌ها با فاصله یا کاما به ترتیب از سوال ۱ (مثل: "3 1 4 2 1")
  const tokens = normalized.split(/[\s,،؛;\n\r]+/).filter(Boolean);
  if (tokens.length >= 2 && tokens.every((tk) => mapLetterToOption(tk) !== null)) {
    tokens.forEach((tk, idx) => {
      const opt = mapLetterToOption(tk);
      if (opt && idx + 1 <= maxQuestions) {
        result[idx + 1] = opt;
      }
    });
    return result;
  }

  // حالت ۳: رشته پیوسته از اعداد ۱ تا ۴ (مثل: "3142213412")
  if (/^[1-4]+$/.test(normalized)) {
    normalized.split('').forEach((ch, idx) => {
      const opt = mapLetterToOption(ch);
      if (opt && idx + 1 <= maxQuestions) {
        result[idx + 1] = opt;
      }
    });
  }

  return result;
}

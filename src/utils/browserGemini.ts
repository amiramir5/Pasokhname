import { GoogleGenAI, Type, ThinkingLevel } from '@google/genai';
import { AIModelPreference, OptionChoice } from '../types/exam';

const FAST_MODEL = 'gemini-3.6-flash';
const STRONG_MODEL = 'gemini-3.8-flash';
const ALLOWED_MODELS = new Set([
  'gemini-3.6-flash',
  'gemini-3.5-flash-lite',
  'gemini-3.8-flash',
]);

export interface BrowserNormalizedBox {
  questionNumber: number;
  ymin: number;
  xmin: number;
  ymax: number;
  xmax: number;
}

function formatError(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error || 'خطای ناشناخته');
  const lower = raw.toLowerCase();
  if (lower.includes('api_key_invalid') || lower.includes('api key not valid') || lower.includes('401')) {
    return 'کلید Gemini API نامعتبر است. لطفاً کلید را بررسی و مجدداً ذخیره کنید.';
  }
  if (lower.includes('403') || lower.includes('permission')) {
    return 'دسترسی کلید API به این مدل محدود شده یا فعال نیست.';
  }
  if (lower.includes('429') || lower.includes('quota') || lower.includes('resource_exhausted')) {
    return 'سهمیه (Quota) یا محدودیت نرخ درخواست کلید API به پایان رسیده است.';
  }
  if (lower.includes('404') || lower.includes('not found')) {
    return 'مدل انتخاب‌شده در دسترس نیست یا نام آن پشتیبانی نمی‌شود.';
  }
  return raw;
}

function normalizeBoxes(
  rawList: Array<{
    questionNumber?: number;
    box_2d?: number[];
    ymin?: number;
    xmin?: number;
    ymax?: number;
    xmax?: number;
  }>,
  startingQuestionNumber: number
): BrowserNormalizedBox[] {
  const normalized: BrowserNormalizedBox[] = [];

  for (let i = 0; i < rawList.length; i++) {
    const q = rawList[i];
    let ymin = 0;
    let xmin = 0;
    let ymax = 0;
    let xmax = 0;

    if (Array.isArray(q.box_2d) && q.box_2d.length >= 4) {
      ymin = Number(q.box_2d[0]);
      xmin = Number(q.box_2d[1]);
      ymax = Number(q.box_2d[2]);
      xmax = Number(q.box_2d[3]);
    } else {
      ymin = Number(q.ymin);
      xmin = Number(q.xmin);
      ymax = Number(q.ymax);
      xmax = Number(q.xmax);
    }

    if (![ymin, xmin, ymax, xmax].every((n) => Number.isFinite(n))) continue;

    const y1 = Math.max(0, Math.min(990, Math.min(ymin, ymax)));
    const y2 = Math.min(1000, Math.max(10, Math.max(ymin, ymax)));
    const x1 = Math.max(0, Math.min(990, Math.min(xmin, xmax)));
    const x2 = Math.min(1000, Math.max(10, Math.max(xmin, xmax)));

    if (y2 - y1 < 22 || x2 - x1 < 40) continue;

    const qNum = Number(q.questionNumber);
    normalized.push({
      questionNumber: Number.isInteger(qNum) && qNum >= 1 ? qNum : startingQuestionNumber + i,
      ymin: Math.max(0, Math.round(y1 - 6)),
      xmin: Math.max(0, Math.round(x1 - 6)),
      ymax: Math.min(1000, Math.round(y2 + 6)),
      xmax: Math.min(1000, Math.round(x2 + 6)),
    });
  }

  const hasRightCol = normalized.some((b) => b.xmin >= 420 && b.xmax - b.xmin < 560);
  const hasLeftCol = normalized.some((b) => b.xmax <= 580 && b.xmax - b.xmin < 560);
  const isTwoColumn = hasRightCol && hasLeftCol;

  normalized.sort((a, b) => {
    if (isTwoColumn) {
      const aInRight = (a.xmin + a.xmax) / 2 >= 500;
      const bInRight = (b.xmin + b.xmax) / 2 >= 500;
      if (aInRight !== bInRight) return aInRight ? -1 : 1;
    }
    return a.ymin - b.ymin;
  });

  return normalized;
}

function needsEscalation(boxes: BrowserNormalizedBox[]): boolean {
  if (boxes.length === 0) return true;
  if (boxes.length <= 2 && boxes.some((b) => b.ymax - b.ymin > 550)) return true;
  if (boxes.some((b) => b.ymax - b.ymin > 620)) return true;
  return false;
}

export async function testConnectionInBrowser(
  apiKey: string,
  model?: AIModelPreference
): Promise<{ success: boolean; model: string; latencyMs: number; reply?: string; error?: string }> {
  const start = Date.now();
  const targetModel =
    model && model !== 'auto' && ALLOWED_MODELS.has(model) ? model : FAST_MODEL;
  try {
    const ai = new GoogleGenAI({ apiKey: apiKey.trim() });
    const response = await ai.models.generateContent({
      model: targetModel,
      contents: 'فقط کلمه OK را بنویس.',
      config: {
        thinkingConfig: { thinkingLevel: ThinkingLevel.MINIMAL },
        maxOutputTokens: 16,
      },
    });
    return {
      success: true,
      model: targetModel,
      latencyMs: Date.now() - start,
      reply: (response.text ?? 'OK').trim(),
    };
  } catch (err) {
    return {
      success: false,
      model: targetModel,
      latencyMs: Date.now() - start,
      error: formatError(err),
    };
  }
}

export async function detectQuestionsInBrowser(
  apiKey: string,
  imageDataUrl: string,
  startingQuestionNumber: number,
  modelPreference?: AIModelPreference
): Promise<{ boxes: BrowserNormalizedBox[]; modelUsed: string; escalated: boolean }> {
  const ai = new GoogleGenAI({ apiKey: apiKey.trim() });
  const cleanBase64 = imageDataUrl.includes(',') ? imageDataUrl.split(',')[1] : imageDataUrl;
  const isAuto = !modelPreference || modelPreference === 'auto';
  const primaryModel = isAuto
    ? FAST_MODEL
    : ALLOWED_MODELS.has(modelPreference)
    ? modelPreference
    : FAST_MODEL;

  const prompt = `شما یک سیستم بینایی ماشین فوق‌دقیق برای تفکیک و برش (Crop) تک‌تک سوالات آزمون‌های چهارگزینه‌ای فارسی (کنکور و مدارس) هستید.
وظیفه شما: تمام سوالات تستی موجود در این صفحه را به‌صورت **جداگانه** پیدا کنید و برای هر سوال فقط یک باکس \`box_2d\` در قالب [ymin, xmin, ymax, xmax] با مقیاس نرمال‌شده 0 تا 1000 برگردانید.
قوانین حیاتی:
1. **هر سوال = یک باکس مستقل**: هرگز چند سوال متوالی را در یک باکس ادغام نکنید! حتی اگر فاصله بین دو سوال کم باشد، با دیدن شماره سوال بعدی یا تمام شدن ۴ گزینه، باکس قبلی را ببندید.
2. **محتوای هر باکس**: شامل شماره سوال، کل متن صورت سوال، شکل/نمودار مربوط به آن و هر ۴ گزینه آن باشد.
3. **چیدمان دوستونی**: اگر صفحه دو ستونی است، ابتدا تمام سوالات ستون راست (از بالا به پایین) و سپس سوالات ستون چپ (از بالا به پایین) را با \`xmin\` و \`xmax\` محدود به همان ستون استخراج کنید.
4. **شماره‌گذاری**: عدد واقعی کنار سوال را در \`questionNumber\` بخوانید یا از ${startingQuestionNumber} ادامه دهید.`;

  const runModel = async (modelName: string, level: ThinkingLevel) => {
    const response = await ai.models.generateContent({
      model: modelName,
      contents: {
        parts: [
          { inlineData: { mimeType: 'image/jpeg', data: cleanBase64 } },
          { text: prompt },
        ],
      },
      config: {
        thinkingConfig: { thinkingLevel: level },
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            questions: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  questionNumber: { type: Type.INTEGER },
                  box_2d: { type: Type.ARRAY, items: { type: Type.INTEGER } },
                },
                required: ['questionNumber', 'box_2d'],
              },
            },
          },
          required: ['questions'],
        },
      },
    });
    const parsed = JSON.parse((response.text ?? '{"questions":[]}').trim());
    return normalizeBoxes(
      Array.isArray(parsed.questions) ? parsed.questions : [],
      startingQuestionNumber
    );
  };

  let modelUsed = primaryModel;
  let escalated = false;
  let boxes: BrowserNormalizedBox[] = [];

  try {
    boxes = await runModel(
      primaryModel,
      primaryModel === STRONG_MODEL ? ThinkingLevel.HIGH : ThinkingLevel.MEDIUM
    );
    if (isAuto && needsEscalation(boxes)) {
      const strong = await runModel(STRONG_MODEL, ThinkingLevel.HIGH);
      if (strong.length >= boxes.length) {
        boxes = strong;
        modelUsed = STRONG_MODEL;
        escalated = true;
      }
    }
  } catch (err) {
    if (isAuto && primaryModel !== STRONG_MODEL) {
      boxes = await runModel(STRONG_MODEL, ThinkingLevel.HIGH);
      modelUsed = STRONG_MODEL;
      escalated = true;
    } else {
      throw new Error(formatError(err));
    }
  }

  return { boxes, modelUsed, escalated };
}

export async function extractAnswerKeyInBrowser(
  apiKey: string,
  params: {
    textInput?: string;
    imagesBase64?: { mimeType: string; data: string }[];
    expectedCount?: number;
    model?: AIModelPreference;
  }
): Promise<{ answers: Record<number, OptionChoice>; explanations: Record<number, string> }> {
  const ai = new GoogleGenAI({ apiKey: params.model ? apiKey.trim() : apiKey.trim() });
  const parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [];

  for (const img of params.imagesBase64 || []) {
    if (img?.data) {
      const cleanBase64 = img.data.includes(',') ? img.data.split(',')[1] : img.data;
      parts.push({ inlineData: { mimeType: img.mimeType || 'image/jpeg', data: cleanBase64 } });
    }
  }

  const countHint = params.expectedCount ? `تعداد کل سوالات حدود ${params.expectedCount} سوال است.` : '';
  parts.push({
    text: `شما یک دستیار تخصصی استخراج کلید پاسخنامه آزمون‌های چهارگزینه‌ای کنکور و مدارس ایران هستید.
${countHint}
از محتوای تصویر یا متن زیر، شماره هر سوال و گزینه صحیح آن (عددی بین 1 تا 4) را استخراج کنید.
الف=1، ب=2، ج=3، د=4.
${params.textInput ? `\nمتن ورودی کاربر:\n${params.textInput}` : ''}`,
  });

  const isAuto = !params.model || params.model === 'auto';
  const primaryModel = isAuto
    ? FAST_MODEL
    : ALLOWED_MODELS.has(params.model!)
    ? params.model!
    : FAST_MODEL;

  const callExtract = async (modelName: string, level: ThinkingLevel) => {
    const response = await ai.models.generateContent({
      model: modelName,
      contents: { parts },
      config: {
        thinkingConfig: { thinkingLevel: level },
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            answers: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  questionNumber: { type: Type.INTEGER },
                  correctOption: { type: Type.INTEGER },
                  explanation: { type: Type.STRING },
                },
                required: ['questionNumber', 'correctOption'],
              },
            },
          },
          required: ['answers'],
        },
      },
    });
    const parsed = JSON.parse((response.text ?? '{"answers":[]}').trim());
    return Array.isArray(parsed.answers) ? parsed.answers : [];
  };

  let rawAnswers = [];
  try {
    rawAnswers = await callExtract(primaryModel, ThinkingLevel.LOW);
    if (isAuto && rawAnswers.length === 0) {
      rawAnswers = await callExtract(STRONG_MODEL, ThinkingLevel.MEDIUM);
    }
  } catch (err) {
    if (isAuto && primaryModel !== STRONG_MODEL) {
      rawAnswers = await callExtract(STRONG_MODEL, ThinkingLevel.MEDIUM);
    } else {
      throw new Error(formatError(err));
    }
  }

  const answers: Record<number, OptionChoice> = {};
  const explanations: Record<number, string> = {};
  for (const item of rawAnswers) {
    const qNum = Number(item.questionNumber);
    const opt = Number(item.correctOption);
    if (qNum >= 1 && (opt === 1 || opt === 2 || opt === 3 || opt === 4)) {
      answers[qNum] = opt as OptionChoice;
      if (item.explanation) explanations[qNum] = String(item.explanation);
    }
  }
  return { answers, explanations };
}

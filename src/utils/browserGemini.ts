import { GoogleGenAI, Type, ThinkingLevel } from '@google/genai';
import { AIModelPreference, OptionChoice } from '../types/exam';
import {
  ALLOWED_MODEL_SET,
  CHEAPEST_MODEL,
  FAST_MODEL,
  STRONG_MODEL,
  resolveAnswerKeyModel,
} from './aiModels';

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
  if (lower.includes('503') || lower.includes('unavailable') || lower.includes('high demand')) {
    return 'سرور این مدل موقتاً شلوغ است (503). سیستم به‌صورت خودکار مدل جایگزین را امتحان می‌کند یا چند ثانیه بعد دوباره تلاش کنید.';
  }
  if (lower.includes('429') || lower.includes('quota') || lower.includes('resource_exhausted')) {
    return 'سهمیه (Quota) یا محدودیت نرخ درخواست کلید API به پایان رسیده است.';
  }
  if (lower.includes('404') || lower.includes('not found')) {
    return 'مدل انتخاب‌شده در دسترس نیست یا نام آن پشتیبانی نمی‌شود.';
  }
  return raw;
}

function isTransientError(error: unknown): boolean {
  const msg = (error instanceof Error ? error.message : String(error || '')).toLowerCase();
  return (
    msg.includes('503') ||
    msg.includes('unavailable') ||
    msg.includes('high demand') ||
    msg.includes('429') ||
    msg.includes('overloaded') ||
    msg.includes('timeout')
  );
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function withTransientRetry<T>(fn: () => Promise<T>, retries = 2): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (!isTransientError(err) || attempt === retries) {
        throw err;
      }
      await sleep(1200 * (attempt + 1));
    }
  }
  throw lastErr;
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
    // حاشیه امن دست‌ودلبازتر برای جلوگیری از قطع شدن گزینه ۴ یا لبه‌های چپ و راست
    const padY = 14;
    const padX = 14;

    normalized.push({
      questionNumber: Number.isInteger(qNum) && qNum >= 1 ? qNum : startingQuestionNumber + i,
      ymin: Math.max(0, Math.round(y1 - padY)),
      xmin: Math.max(0, Math.round(x1 - padX)),
      ymax: Math.min(1000, Math.round(y2 + padY)),
      xmax: Math.min(1000, Math.round(x2 + padX)),
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
    model && model !== 'auto' && ALLOWED_MODEL_SET.has(model) ? model : FAST_MODEL;
  try {
    const ai = new GoogleGenAI({ apiKey: apiKey.trim() });
    const response = await ai.models.generateContent({
      model: targetModel,
      contents: 'فقط کلمه OK را بنویس.',
      config: {
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
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
    : ALLOWED_MODEL_SET.has(modelPreference)
    ? modelPreference
    : FAST_MODEL;

  const prompt = `شما یک سیستم بینایی ماشین فوق‌دقیق برای تفکیک و برش (Crop) تک‌تک سوالات آزمون‌های چهارگزینه‌ای فارسی (کنکور و مدارس) هستید.
وظیفه شما: تمام سوالات تستی موجود در این صفحه را به‌صورت **جداگانه** پیدا کنید و برای هر سوال فقط یک باکس \`box_2d\` در قالب [ymin, xmin, ymax, xmax] با مقیاس نرمال‌شده 0 تا 1000 برگردانید.

قوانین بسیار حیاتی برای جلوگیری از ناقص ماندن گزینه‌ها:
1. **دربرگیری کامل هر ۴ گزینه**: اکثر تست‌ها دارای ۴ گزینه هستند (۱ تا ۴ یا الف تا د). حد پایین باکس (ymax) باید حتماً پایین‌تر از آخرین سطر گزینه ۴ یا گزینه «د» قرار گیرد. هرگز قبل از اتمام کامل تمام گزینه‌های سوال، باکس را نبندید!
2. **هر سوال = یک باکس مستقل**: هرگز چند سوال متوالی را در یک باکس ادغام نکنید! با دیدن شماره سوال بعدی یا شروع تست بعد، باکس قبلی بسته شود.
3. **محتوای کامل هر باکس**: شامل شماره سوال، صورت سوال، شکل‌ها/نمودارها و تمام گزینه‌های ۱ و ۲ و ۳ و ۴ باشد.
4. **حاشیه تنفس کافی**: در چهار طرف سوال (بالا، پایین زیر گزینه‌ها، چپ و راست) کمی فاصله آزاد بگذارید تا هیچ حروفی لبه‌مرزی و بریده نشود.
5. **چیدمان دوستونی**: اگر صفحه دو ستونی است، ابتدا سوالات ستون راست (از بالا به پایین) و سپس ستون چپ را با \`xmin\` و \`xmax\` محدود به همان ستون استخراج کنید.
6. **شماره‌گذاری**: عدد واقعی کنار سوال را در \`questionNumber\` بخوانید یا از ${startingQuestionNumber} ادامه دهید.`;

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

  let modelUsed: string = primaryModel;
  let escalated = false;
  let boxes: BrowserNormalizedBox[] = [];

  // ترتیب مدل‌های جایگزین در صورت خطای موقت ۵۰۳/۴۲۹
  const fallbackChain = Array.from(
    new Set([primaryModel, FAST_MODEL, CHEAPEST_MODEL, STRONG_MODEL])
  );

  let lastErr: unknown;
  let succeeded = false;

  for (let idx = 0; idx < fallbackChain.length; idx++) {
    const candidateModel = fallbackChain[idx];
    const level =
      candidateModel === STRONG_MODEL ? ThinkingLevel.HIGH : ThinkingLevel.MEDIUM;
    try {
      boxes = await withTransientRetry(() => runModel(candidateModel, level), 1);
      modelUsed = candidateModel;
      if (idx > 0) escalated = true;

      // اگر در حالت auto هستیم و خروجی مشکوک به ادغام است، یک بار با مدل قوی‌تر هم بررسی می‌کنیم
      if (idx === 0 && isAuto && needsEscalation(boxes) && candidateModel !== STRONG_MODEL) {
        try {
          const strong = await withTransientRetry(
            () => runModel(STRONG_MODEL, ThinkingLevel.HIGH),
            1
          );
          if (strong.length >= boxes.length) {
            boxes = strong;
            modelUsed = STRONG_MODEL;
            escalated = true;
          }
        } catch {
          // اگر مدل قوی‌تر موقتاً شلوغ بود، همان نتیجه مدل اول را نگه می‌داریم
        }
      }

      succeeded = true;
      break;
    } catch (err) {
      lastErr = err;
      if (!isTransientError(err) && !isAuto) {
        throw new Error(formatError(err));
      }
    }
  }

  if (!succeeded) {
    throw new Error(formatError(lastErr));
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
    includeExplanations?: boolean;
  }
): Promise<{ answers: Record<number, OptionChoice>; explanations: Record<number, string> }> {
  const ai = new GoogleGenAI({ apiKey: apiKey.trim() });
  const parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [];

  for (const img of params.imagesBase64 || []) {
    if (img?.data) {
      const cleanBase64 = img.data.includes(',') ? img.data.split(',')[1] : img.data;
      parts.push({ inlineData: { mimeType: img.mimeType || 'image/jpeg', data: cleanBase64 } });
    }
  }

  const includeExplanations = Boolean(params.includeExplanations);
  const countHint = params.expectedCount
    ? `تعداد کل سوالات این درس حدود ${params.expectedCount} سوال است.`
    : '';

  parts.push({
    text: `تو یک استخراج‌کنندهٔ دقیق «کلید پاسخنامه» هستی و فقط دو چیز را برمی‌گردانی: شماره سوال و شماره گزینه صحیح (۱ تا ۴).

${countHint}

قواعد قطعی (حتی اگر پاسخنامه تشریحی و طولانی باشد):
1) پاسخنامه ممکن است برای هر سوال تا دو صفحه توضیح، استدلال یا محاسبه داشته باشد. تو نباید متن تشریحی را بخوانی یا خلاصه کنی؛ فقط همان جمله/نشانه‌ای را پیدا کن که گزینه صحیح را اعلام می‌کند: «پاسخ: گزینه ۳»، «پاسخ صحیح: ب»، «گزینه درست: ۲»، تیک کنار یک گزینه، یا عبارت «درست است».
2) برای هر سوال فقط یک رکورد با questionNumber و correctOption خروجی بده.
3) حروف الف=۱، ب=۲، ج=۳، د=۴ (و A=1, B=2, C=3, D=4) و اعداد فارسی/عربی را به عدد ۱ تا ۴ تبدیل کن.
4) اگر گزینه صحیح یک سوال قطعی نیست یا حذف/چندپاسخه است، آن سوال را نادیده بگیر و حدس نزن.
5) هیچ توضیح، متن اضافه، مقدمه یا نتیجه‌گیری برنگردان.
${includeExplanations ? '6) فقط برای هر سوال یک جمله خیلی کوتاه (حداکثر ۱۵ کلمه) به‌عنوان دلیل در فیلد explanation بنویس.' : '6) فیلد explanation را هرگز برنگردان.'}
${params.textInput ? `\nمتن پاسخنامه/کلید:\n${params.textInput}` : ''}`,
  });

  const isAuto =
    !params.model || params.model === 'auto' || !ALLOWED_MODEL_SET.has(params.model);
  const primaryModel = resolveAnswerKeyModel(params.model);

  // توکن‌های «فکر کردن» مدل هم از همین سقف کم می‌شوند؛ سقف کم باعث می‌شد مدل
  // فقط چند سوال اول را برگرداند و بقیه ناتمام بماند. پس سخاوتمندانه حساب می‌کنیم.
  const maxOutputTokens = Math.min(
    8192,
    Math.max(1024, (params.expectedCount || 40) * (includeExplanations ? 70 : 40))
  );

  const answerItemProperties: Record<string, unknown> = {
    questionNumber: { type: Type.INTEGER },
    correctOption: { type: Type.INTEGER },
  };
  if (includeExplanations) {
    answerItemProperties.explanation = { type: Type.STRING };
  }

  const callExtract = async (
    modelName: string,
    level: ThinkingLevel,
    onlyQuestions?: number[]
  ) => {
    const requestParts =
      onlyQuestions && onlyQuestions.length > 0
        ? [
            ...parts,
            {
              text: `\nفقط شماره سوال‌های زیر را که هنوز استخراج نشده‌اند پیدا کن و خروجی بده: ${onlyQuestions.join(
                '، '
              )}. برای بقیه سوال‌ها هیچ رکوردی برنگردان.`,
            },
          ]
        : parts;
    const response = await ai.models.generateContent({
      model: modelName,
      contents: { parts: requestParts },
      config: {
        thinkingConfig: { thinkingLevel: level },
        maxOutputTokens,
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            answers: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: answerItemProperties,
                required: includeExplanations
                  ? ['questionNumber', 'correctOption', 'explanation']
                  : ['questionNumber', 'correctOption'],
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

  const chain = Array.from(
    new Set(isAuto ? [CHEAPEST_MODEL, FAST_MODEL, STRONG_MODEL] : [primaryModel, FAST_MODEL, STRONG_MODEL])
  );

  let rawAnswers: Array<{ questionNumber?: number; correctOption?: number; explanation?: string }> = [];
  let lastErr: unknown;
  for (let idx = 0; idx < chain.length; idx++) {
    const modelName = chain[idx];
    const level =
      modelName === STRONG_MODEL || modelName === FAST_MODEL
        ? ThinkingLevel.MEDIUM
        : ThinkingLevel.LOW;
    try {
      rawAnswers = await withTransientRetry(() => callExtract(modelName, level), 1);
      if (rawAnswers.length > 0) break;
    } catch (err) {
      lastErr = err;
      if (!isTransientError(err) && idx === chain.length - 1) {
        throw new Error(formatError(err));
      }
    }
  }

  const answers: Record<number, OptionChoice> = {};
  const explanations: Record<number, string> = {};
  const mergeAnswers = (
    items: Array<{ questionNumber?: number; correctOption?: number; explanation?: string }>
  ) => {
    for (const item of items) {
      const qNum = Number(item.questionNumber);
      const opt = Number(item.correctOption);
      if (qNum >= 1 && (opt === 1 || opt === 2 || opt === 3 || opt === 4)) {
        answers[qNum] = opt as OptionChoice;
        if (includeExplanations && item.explanation) explanations[qNum] = String(item.explanation);
      }
    }
  };
  mergeAnswers(rawAnswers);

  // مرحله دوم: اگر تعداد کل سوالات مشخص است ولی هنوز چند شماره پیدا نشده،
  // دقیقاً همان شماره‌ها را با مدل‌های قوی‌تر دوباره جست‌وجو می‌کنیم.
  const expected = params.expectedCount || 0;
  if (expected > 0) {
    for (let round = 0; round < 2; round++) {
      const missing: number[] = [];
      for (let n = 1; n <= expected; n++) {
        if (!answers[n]) missing.push(n);
      }
      if (missing.length === 0) break;

      let progressed = false;
      for (const modelName of Array.from(new Set([FAST_MODEL, STRONG_MODEL]))) {
        const stillMissing = missing.filter((n) => !answers[n]);
        if (stillMissing.length === 0) break;
        try {
          const extra = await withTransientRetry(
            () => callExtract(modelName, ThinkingLevel.MEDIUM, stillMissing.slice(0, 40)),
            1
          );
          if (extra.length > 0) {
            mergeAnswers(extra);
            progressed = true;
          }
        } catch {
          // اگر مدل کمکی پاسخ نداد، با همان یافته‌های قبلی ادامه می‌دهیم
        }
      }
      if (!progressed) break;
    }
  }

  if (Object.keys(answers).length === 0) {
    const reason = lastErr ? ` (${formatError(lastErr)})` : '';
    throw new Error(
      `هیچ کلید پاسخی در محتوای انتخاب‌شده پیدا نشد${reason}. محدوده صفحه را بررسی کنید یا از تب «از متن» / جدول دستی استفاده کنید.`
    );
  }

  return { answers, explanations };
}

import express from 'express';
import { createServer as createViteServer } from 'vite';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI, Type, ThinkingLevel } from '@google/genai';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const FAST_MODEL = 'gemini-3.6-flash';
const STRONG_MODEL = 'gemini-3.8-flash';
const ALLOWED_MODELS = new Set([
  'gemini-3.6-flash',
  'gemini-3.5-flash-lite',
  'gemini-3.8-flash',
]);

function isUsableKey(key: string | undefined | null): key is string {
  if (!key) return false;
  const trimmed = key.trim();
  return (
    trimmed.length > 10 &&
    trimmed !== 'MY_GEMINI_API_KEY' &&
    trimmed !== 'YOUR_API_KEY'
  );
}

function resolveApiKey(req: express.Request): string | null {
  const headerKey = req.headers['x-gemini-api-key'];
  if (typeof headerKey === 'string' && isUsableKey(headerKey)) {
    return headerKey.trim();
  }
  if (isUsableKey(process.env.GEMINI_API_KEY)) {
    return process.env.GEMINI_API_KEY!.trim();
  }
  return null;
}

function createGenAIClient(apiKey: string): GoogleGenAI {
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

function formatGeminiError(error: unknown): string {
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

interface RawDetectedQuestion {
  questionNumber?: number;
  box_2d?: number[];
  ymin?: number;
  xmin?: number;
  ymax?: number;
  xmax?: number;
}

interface NormalizedQuestionBox {
  questionNumber: number;
  ymin: number;
  xmin: number;
  ymax: number;
  xmax: number;
}

function normalizeAndSortBoxes(
  rawList: RawDetectedQuestion[],
  startingQuestionNumber: number
): NormalizedQuestionBox[] {
  const normalized: NormalizedQuestionBox[] = [];

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

    // اطمینان از ترتیب صحیح و محدوده 0..1000
    const y1 = Math.max(0, Math.min(990, Math.min(ymin, ymax)));
    const y2 = Math.min(1000, Math.max(10, Math.max(ymin, ymax)));
    const x1 = Math.max(0, Math.min(990, Math.min(xmin, xmax)));
    const x2 = Math.min(1000, Math.max(10, Math.max(xmin, xmax)));

    // حذف باکس‌های خیلی کوچک یا نویز
    if (y2 - y1 < 22 || x2 - x1 < 40) continue;

    // افزودن حاشیه امن ملایم تا متن و گزینه‌ها بریده نشوند
    const padY = 6;
    const padX = 6;
    const qNum = Number(q.questionNumber);

    normalized.push({
      questionNumber: Number.isInteger(qNum) && qNum >= 1 ? qNum : startingQuestionNumber + i,
      ymin: Math.max(0, Math.round(y1 - padY)),
      xmin: Math.max(0, Math.round(x1 - padX)),
      ymax: Math.min(1000, Math.round(y2 + padY)),
      xmax: Math.min(1000, Math.round(x2 + padX)),
    });
  }

  // تشخیص دوستونی بودن صفحه (اگر باکس‌هایی در نیمه راست و نیمه چپ کنار هم باشند)
  const hasRightCol = normalized.some((b) => b.xmin >= 420 && b.xmax - b.xmin < 560);
  const hasLeftCol = normalized.some((b) => b.xmax <= 580 && b.xmax - b.xmin < 560);
  const isTwoColumn = hasRightCol && hasLeftCol;

  normalized.sort((a, b) => {
    if (isTwoColumn) {
      const aCenter = (a.xmin + a.xmax) / 2;
      const bCenter = (b.xmin + b.xmax) / 2;
      const aInRight = aCenter >= 500;
      const bInRight = bCenter >= 500;
      if (aInRight !== bInRight) return aInRight ? -1 : 1;
    }
    return a.ymin - b.ymin;
  });

  return normalized;
}

function needsModelEscalation(boxes: NormalizedQuestionBox[]): boolean {
  if (boxes.length === 0) return true;

  // اگر فقط ۱ یا ۲ باکس در صفحه است و یکی از آن‌ها بیش از ۵۵٪ ارتفاع صفحه را گرفته،
  // احتمال ادغام چند سوال در یک باکس بسیار بالاست
  const hugeBox = boxes.some((b) => b.ymax - b.ymin > 550);
  if (boxes.length <= 2 && hugeBox) return true;

  // اگر باکس خیلی بزرگی (> ۴۸٪ ارتفاع) در کنار چند باکس دیگر باشد هم مشکوک به ادغام است
  if (boxes.some((b) => b.ymax - b.ymin > 620)) return true;

  return false;
}

async function runDetectQuestionsWithModel(
  ai: GoogleGenAI,
  model: string,
  thinkingLevel: ThinkingLevel,
  cleanBase64: string,
  mimeType: string,
  startingQuestionNumber: number
): Promise<NormalizedQuestionBox[]> {
  const prompt = `شما یک سیستم بینایی ماشین فوق‌دقیق برای تفکیک و برش (Crop) تک‌تک سوالات آزمون‌های چهارگزینه‌ای فارسی (کنکور و مدارس) هستید.

وظیفه شما: تمام سوالات تستی موجود در این صفحه را به‌صورت **جداگانه** پیدا کنید و برای هر سوال فقط یک باکس ` + '`box_2d`' + ` در قالب [ymin, xmin, ymax, xmax] با مقیاس نرمال‌شده 0 تا 1000 برگردانید.

قوانین حیاتی (بسیار مهم):
1. **هر سوال = یک باکس مستقل**: هرگز چند سوال متوالی را در یک باکس ادغام نکنید! حتی اگر فاصله بین دو سوال بسیار کم باشد، به محض دیدن شماره سوال بعدی (مثلاً «۲-»، «۲.»، «(۲)» یا تغییر شماره تست) یا تمام شدن ۴ گزینه سوال فعلی، باکس سوال فعلی را ببندید و برای سوال بعدی یک باکس جدید بسازید.
2. **محتوای هر باکس**: هر باکس باید شامل شماره سوال، کل متن صورت سوال، شکل/نمودار/جدول مربوط به همان سوال و تمام ۴ گزینه آن (۱ تا ۴ یا الف تا د) باشد.
3. **چیدمان دوستونی**: اگر صفحه دو ستونی است، ابتدا تمام سوالات ستون سمت راست (از بالا به پایین) و سپس تمام سوالات ستون سمت چپ (از بالا به پایین) را با ` + '`xmin`' + ` و ` + '`xmax`' + ` محدود به همان ستون استخراج کنید.
4. **مرز دقیق**: در بالا و پایین هر سوال حدود 5 تا 10 واحد حاشیه امن بگذارید ولی وارد سوال قبلی یا بعدی نشوید.
5. **شماره‌گذاری**: عدد واقعی کنار سوال را در ` + '`questionNumber`' + ` بخوانید؛ اگر خوانا نبود از ${startingQuestionNumber} به ترتیب ادامه دهید.`;

  const response = await ai.models.generateContent({
    model,
    contents: {
      parts: [
        {
          inlineData: {
            mimeType: mimeType || 'image/jpeg',
            data: cleanBase64,
          },
        },
        { text: prompt },
      ],
    },
    config: {
      thinkingConfig: { thinkingLevel },
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          questions: {
            type: Type.ARRAY,
            description: 'لیست تمام سوالات جداگانه موجود در صفحه',
            items: {
              type: Type.OBJECT,
              properties: {
                questionNumber: {
                  type: Type.INTEGER,
                  description: 'شماره سوال خوانده‌شده از تصویر',
                },
                box_2d: {
                  type: Type.ARRAY,
                  description: 'مختصات باکس سوال به ترتیب [ymin, xmin, ymax, xmax] بین 0 تا 1000',
                  items: { type: Type.INTEGER },
                },
              },
              required: ['questionNumber', 'box_2d'],
            },
          },
        },
        required: ['questions'],
      },
    },
  });

  const rawText = (response.text ?? '{"questions":[]}').trim();
  const parsed = JSON.parse(rawText) as { questions?: RawDetectedQuestion[] };
  return normalizeAndSortBoxes(
    Array.isArray(parsed.questions) ? parsed.questions : [],
    startingQuestionNumber
  );
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Allow large payloads for PDF page images and high-res exam scans
  app.use(express.json({ limit: '50mb' }));

  // 0. Endpoint: Check server AI key status
  app.get('/api/ai/status', (_req, res) => {
    res.json({
      hasServerKey: isUsableKey(process.env.GEMINI_API_KEY),
      defaultModel: FAST_MODEL,
      supportedModels: ['auto', FAST_MODEL, 'gemini-3.5-flash-lite', STRONG_MODEL],
    });
  });

  // 0.1 Endpoint: Save API key to runtime env & local .env file
  app.post('/api/ai/save-key', (req, res) => {
    try {
      const { apiKey } = req.body as { apiKey?: string };
      if (!isUsableKey(apiKey)) {
        res.status(400).json({
          success: false,
          error: 'کلید واردشده معتبر به نظر نمی‌رسد (باید حداقل ۱۰ کاراکتر باشد).',
        });
        return;
      }

      const cleanKey = apiKey.trim();
      process.env.GEMINI_API_KEY = cleanKey;

      let savedToEnvFile = false;
      try {
        const envPath = path.join(__dirname, '.env');
        let envContent = '';
        if (fs.existsSync(envPath)) {
          envContent = fs.readFileSync(envPath, 'utf8');
        }
        if (/^GEMINI_API_KEY=.*$/m.test(envContent)) {
          envContent = envContent.replace(/^GEMINI_API_KEY=.*$/m, `GEMINI_API_KEY="${cleanKey}"`);
        } else {
          envContent = `${envContent.trimEnd()}\nGEMINI_API_KEY="${cleanKey}"\n`.trimStart();
        }
        fs.writeFileSync(envPath, envContent, 'utf8');
        savedToEnvFile = true;
      } catch {
        // در محیط‌های Read-only مثل برخی سرورهای ابری، فقط در حافظه و مرورگر نگهداری می‌شود
        savedToEnvFile = false;
      }

      res.json({
        success: true,
        savedToEnvFile,
      });
    } catch (error: unknown) {
      res.status(500).json({
        success: false,
        error: formatGeminiError(error),
      });
    }
  });

  // 0.2 Endpoint: Real live connection test against Gemini API
  app.post('/api/ai/test-connection', async (req, res) => {
    const startTime = Date.now();
    try {
      const { apiKey: bodyKey, model: requestedModel } = req.body as {
        apiKey?: string;
        model?: string;
      };

      const effectiveKey = isUsableKey(bodyKey) ? bodyKey.trim() : resolveApiKey(req);
      if (!effectiveKey) {
        res.status(400).json({
          success: false,
          error: 'کلید Gemini API در مرورگر یا فایل .env سرور تنظیم نشده است.',
        });
        return;
      }

      const targetModel =
        requestedModel && ALLOWED_MODELS.has(requestedModel) ? requestedModel : FAST_MODEL;

      const ai = createGenAIClient(effectiveKey);
      const response = await ai.models.generateContent({
        model: targetModel,
        contents: 'فقط کلمه OK را بنویس.',
        config: {
          thinkingConfig: { thinkingLevel: ThinkingLevel.MINIMAL },
          maxOutputTokens: 16,
        },
      });

      const latencyMs = Date.now() - startTime;
      const reply = (response.text ?? '').trim();

      res.json({
        success: true,
        model: targetModel,
        latencyMs,
        reply: reply || 'OK',
      });
    } catch (error: unknown) {
      res.status(500).json({
        success: false,
        latencyMs: Date.now() - startTime,
        error: formatGeminiError(error),
      });
    }
  });

  // 1. Endpoint: Extract Answer Key from Text, Image(s), or PDF Page Images
  app.post('/api/ai/extract-answers', async (req, res) => {
    try {
      const { textInput, imagesBase64, expectedCount, model: requestedModel } = req.body as {
        textInput?: string;
        imagesBase64?: { mimeType: string; data: string }[];
        expectedCount?: number;
        model?: string;
      };

      const apiKey = resolveApiKey(req);
      if (!apiKey) {
        res.status(401).json({
          success: false,
          error: 'کلید Gemini API تنظیم نشده است. از بخش تنظیمات یا کادر کلید API در همین صفحه کلید خود را وارد کنید.',
        });
        return;
      }

      const ai = createGenAIClient(apiKey);
      const parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [];

      if (Array.isArray(imagesBase64) && imagesBase64.length > 0) {
        for (const img of imagesBase64) {
          if (img && img.data) {
            const cleanBase64 = img.data.includes(',') ? img.data.split(',')[1] : img.data;
            parts.push({
              inlineData: {
                mimeType: img.mimeType || 'image/jpeg',
                data: cleanBase64,
              },
            });
          }
        }
      }

      const countHint = expectedCount ? `تعداد کل سوالات حدود ${expectedCount} سوال است.` : '';
      const promptText = `شما یک دستیار تخصصی استخراج کلید پاسخنامه آزمون‌های چهارگزینه‌ای کنکور و مدارس ایران هستید.
${countHint}
از محتوای تصویر یا متن زیر، شماره هر سوال و گزینه صحیح آن (عددی بین 1 تا 4) را استخراج کنید.
توجه:
- اگر گزینه‌ها با حروف الف، ب، ج، د یا A, B, C, D مشخص شده‌اند: الف=1، ب=2، ج=3، د=4.
- اعداد فارسی (۱، ۲، ۳، ۴) را به عدد صحیح 1 تا 4 تبدیل کنید.
- اگر توضیح کوتاهی برای پاسخ وجود دارد در فیلد explanation بنویسید وگرنه خالی بگذارید.
${textInput ? `\nمتن ورودی کاربر:\n${textInput}` : ''}`;

      parts.push({ text: promptText });

      const isAuto = !requestedModel || requestedModel === 'auto';
      const primaryModel = isAuto
        ? FAST_MODEL
        : ALLOWED_MODELS.has(requestedModel)
        ? requestedModel
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
                  description: 'لیست کلید سوالات استخراج شده',
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      questionNumber: {
                        type: Type.INTEGER,
                        description: 'شماره سوال (از 1 به بالا)',
                      },
                      correctOption: {
                        type: Type.INTEGER,
                        description: 'گزینه صحیح عددی بین 1 تا 4',
                      },
                      explanation: {
                        type: Type.STRING,
                        description: 'توضیح کوتاه یا نکته کلیدی پاسخ در صورت وجود',
                      },
                    },
                    required: ['questionNumber', 'correctOption'],
                  },
                },
              },
              required: ['answers'],
            },
          },
        });
        const rawText = (response.text ?? '{"answers":[]}').trim();
        const parsed = JSON.parse(rawText);
        return Array.isArray(parsed.answers) ? parsed.answers : [];
      };

      let modelUsed = primaryModel;
      let answers = [];
      try {
        answers = await callExtract(primaryModel, ThinkingLevel.LOW);
        if (isAuto && answers.length === 0) {
          modelUsed = STRONG_MODEL;
          answers = await callExtract(STRONG_MODEL, ThinkingLevel.MEDIUM);
        }
      } catch (primaryErr) {
        if (isAuto && primaryModel !== STRONG_MODEL) {
          modelUsed = STRONG_MODEL;
          answers = await callExtract(STRONG_MODEL, ThinkingLevel.MEDIUM);
        } else {
          throw primaryErr;
        }
      }

      res.json({
        success: true,
        modelUsed,
        answers,
      });
    } catch (error: unknown) {
      const errMessage = formatGeminiError(error);
      console.error('Error in /api/ai/extract-answers:', errMessage);
      res.status(500).json({
        success: false,
        error: errMessage,
      });
    }
  });

  // 2. Endpoint: AI Vision Question Bounding Box Detection for Auto-Cropping Exam Sheets
  app.post('/api/ai/detect-questions', async (req, res) => {
    try {
      const { imageBase64, mimeType, pageIndex, startingQuestionNumber, model: requestedModel } =
        req.body as {
          imageBase64: string;
          mimeType?: string;
          pageIndex?: number;
          startingQuestionNumber?: number;
          model?: string;
        };

      if (!imageBase64) {
        res.status(400).json({ success: false, error: 'تصویر برگه سوال ارسال نشده است.' });
        return;
      }

      const apiKey = resolveApiKey(req);
      if (!apiKey) {
        res.status(401).json({
          success: false,
          error: 'کلید Gemini API تنظیم نشده است. لطفاً ابتدا کلید API را در تنظیمات یا کادر بالای همین بخش وارد و تست کنید.',
        });
        return;
      }

      const ai = createGenAIClient(apiKey);
      const cleanBase64 = imageBase64.includes(',') ? imageBase64.split(',')[1] : imageBase64;
      const startNum = startingQuestionNumber || 1;
      const imgMime = mimeType || 'image/jpeg';

      const isAuto = !requestedModel || requestedModel === 'auto';
      const primaryModel = isAuto
        ? FAST_MODEL
        : ALLOWED_MODELS.has(requestedModel)
        ? requestedModel
        : FAST_MODEL;

      let modelUsed = primaryModel;
      let escalated = false;
      let questions: NormalizedQuestionBox[] = [];

      try {
        questions = await runDetectQuestionsWithModel(
          ai,
          primaryModel,
          primaryModel === STRONG_MODEL ? ThinkingLevel.HIGH : ThinkingLevel.MEDIUM,
          cleanBase64,
          imgMime,
          startNum
        );

        // اگر در حالت خودکار هستیم و خروجی مشکوک به ادغام چند سوال یا خالی است، به مدل قوی‌تر ارتقا می‌دهیم
        if (isAuto && needsModelEscalation(questions)) {
          const strongBoxes = await runDetectQuestionsWithModel(
            ai,
            STRONG_MODEL,
            ThinkingLevel.HIGH,
            cleanBase64,
            imgMime,
            startNum
          );
          if (strongBoxes.length >= questions.length) {
            questions = strongBoxes;
            modelUsed = STRONG_MODEL;
            escalated = true;
          }
        }
      } catch (primaryErr) {
        if (isAuto && primaryModel !== STRONG_MODEL) {
          questions = await runDetectQuestionsWithModel(
            ai,
            STRONG_MODEL,
            ThinkingLevel.HIGH,
            cleanBase64,
            imgMime,
            startNum
          );
          modelUsed = STRONG_MODEL;
          escalated = true;
        } else {
          throw primaryErr;
        }
      }

      res.json({
        success: true,
        pageIndex: pageIndex ?? 0,
        modelUsed,
        escalated,
        questions,
      });
    } catch (error: unknown) {
      const errMessage = formatGeminiError(error);
      console.error('Error in /api/ai/detect-questions:', errMessage);
      res.status(500).json({
        success: false,
        error: errMessage,
      });
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Pasokhbarg Server running on http://localhost:${PORT}`);
  });
}

startServer();

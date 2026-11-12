import express from 'express';
import { createServer as createViteServer } from 'vite';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI, Type, ThinkingLevel } from '@google/genai';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function getGenAIClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('کلید API هوش مصنوعی در تنظیمات سرور یافت نشد (GEMINI_API_KEY).');
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Allow large payloads for PDF page images and high-res exam scans
  app.use(express.json({ limit: '35mb' }));

  // 1. Endpoint: Extract Answer Key from Text, Image(s), or PDF Page Images
  app.post('/api/ai/extract-answers', async (req, res) => {
    try {
      const { textInput, imagesBase64, expectedCount } = req.body as {
        textInput?: string;
        imagesBase64?: { mimeType: string; data: string }[];
        expectedCount?: number;
      };

      const ai = getGenAIClient();
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

      const response = await ai.models.generateContent({
        model: 'gemini-3.8-flash',
        contents: { parts },
        config: {
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
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
      res.json({
        success: true,
        answers: Array.isArray(parsed.answers) ? parsed.answers : [],
      });
    } catch (error: unknown) {
      const errMessage = error instanceof Error ? error.message : 'خطای ناشناخته در استخراج پاسخنامه';
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
      const { imageBase64, mimeType, pageIndex, startingQuestionNumber } = req.body as {
        imageBase64: string;
        mimeType?: string;
        pageIndex?: number;
        startingQuestionNumber?: number;
      };

      if (!imageBase64) {
        res.status(400).json({ success: false, error: 'تصویر برگه سوال ارسال نشده است.' });
        return;
      }

      const ai = getGenAIClient();
      const cleanBase64 = imageBase64.includes(',') ? imageBase64.split(',')[1] : imageBase64;
      const startNum = startingQuestionNumber || 1;

      const prompt = `شما یک سیستم بینایی ماشین فوق‌دقیق برای برش (Crop) سوالات آزمون‌های چهارگزینه‌ای فارسی هستید.
در این تصویر برگه آزمون، تمام سوالات تستی موجود در صفحه را پیدا کنید.
برای هر سوال، مختصات مستطیل دربرگیرنده کامل سوال (شامل صورت سوال، شکل یا نمودار مربوط به آن سوال، و هر ۴ گزینه آن) را در مقیاس نرمال‌شده 0 تا 1000 برگردانید.
نکات بسیار مهم:
1. مختصات باید شامل ymin (بالای سوال)، xmin (چپ‌ترین نقطه باکس سوال)، ymax (پایین‌ترین نقطه آخرین گزینه سوال) و xmax (راست‌ترین نقطه شامل شماره سوال) باشد.
2. کمی حاشیه امن (حدود 8 تا 12 واحد از 1000) در بالا و پایین هر سوال لحاظ کنید تا هیچ بخشی از متن یا گزینه‌ها بریده نشود.
3. اگر صفحه دو ستونی است، ابتدا سوالات ستون راست (از بالا به پایین) و سپس سوالات ستون چپ (از بالا به پایین) را به ترتیب شماره سوال فهرست کنید.
4. شماره سوال (questionNumber) را از روی عدد کنار سوال بخوانید (یا از ${startNum} به ترتیب شماره‌گذاری کنید).`;

      const response = await ai.models.generateContent({
        model: 'gemini-3.8-flash',
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
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              questions: {
                type: Type.ARRAY,
                description: 'لیست باکس‌های سوالات تشخیص داده شده در صفحه',
                items: {
                  type: Type.OBJECT,
                  properties: {
                    questionNumber: {
                      type: Type.INTEGER,
                      description: 'شماره سوال تشخیص داده شده',
                    },
                    ymin: {
                      type: Type.INTEGER,
                      description: 'حد بالای سوال بین 0 تا 1000',
                    },
                    xmin: {
                      type: Type.INTEGER,
                      description: 'حد چپ سوال بین 0 تا 1000',
                    },
                    ymax: {
                      type: Type.INTEGER,
                      description: 'حد پایین سوال (زیر گزینه‌ها) بین 0 تا 1000',
                    },
                    xmax: {
                      type: Type.INTEGER,
                      description: 'حد راست سوال (شامل شماره سوال) بین 0 تا 1000',
                    },
                  },
                  required: ['questionNumber', 'ymin', 'xmin', 'ymax', 'xmax'],
                },
              },
            },
            required: ['questions'],
          },
        },
      });

      const rawText = (response.text ?? '{"questions":[]}').trim();
      const parsed = JSON.parse(rawText);

      res.json({
        success: true,
        pageIndex: pageIndex ?? 0,
        questions: Array.isArray(parsed.questions) ? parsed.questions : [],
      });
    } catch (error: unknown) {
      const errMessage = error instanceof Error ? error.message : 'خطا در تشخیص باکس سوالات با هوش مصنوعی';
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

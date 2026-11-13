import * as pdfjsLib from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { AIModelPreference, BoundingBoxQuestion, OptionChoice } from '../types/exam';
import { toFarsiDigits, fromFarsiDigits } from './farsi';
import {
  testConnectionInBrowser,
  detectQuestionsInBrowser,
  extractAnswerKeyInBrowser,
} from './browserGemini';

const API_KEY_STORAGE_KEY = 'pasokhbarg_gemini_api_key';

export function getStoredGeminiApiKey(): string {
  if (typeof window === 'undefined') return '';
  try {
    return (localStorage.getItem(API_KEY_STORAGE_KEY) || '').trim();
  } catch {
    return '';
  }
}

export function setStoredGeminiApiKey(key: string): void {
  if (typeof window === 'undefined') return;
  try {
    const trimmed = key.trim();
    if (trimmed) {
      localStorage.setItem(API_KEY_STORAGE_KEY, trimmed);
    } else {
      localStorage.removeItem(API_KEY_STORAGE_KEY);
    }
  } catch {
    // ignore storage errors
  }
}

export function getStoredAIModelPreference(): AIModelPreference {
  if (typeof window === 'undefined') return 'auto';
  try {
    const raw = localStorage.getItem('pasokhbarg_settings_v1');
    if (!raw) return 'auto';
    const parsed = JSON.parse(raw);
    return parsed.aiModelPreference || 'auto';
  } catch {
    return 'auto';
  }
}

function buildAIHeaders(explicitKey?: string): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const key = (explicitKey ?? getStoredGeminiApiKey()).trim();
  if (key) {
    headers['x-gemini-api-key'] = key;
  }
  return headers;
}

export async function fetchAIStatus(): Promise<{
  hasServerKey: boolean;
  hasBrowserKey: boolean;
  defaultModel: string;
}> {
  const hasBrowserKey = Boolean(getStoredGeminiApiKey());
  try {
    const res = await fetch('/api/ai/status');
    if (!res.ok) {
      return { hasServerKey: false, hasBrowserKey, defaultModel: 'gemini-4-hydrogen' };
    }
    const data = await res.json();
    return {
      hasServerKey: Boolean(data.hasServerKey),
      hasBrowserKey,
      defaultModel: data.defaultModel || 'gemini-4-hydrogen',
    };
  } catch {
    return { hasServerKey: false, hasBrowserKey, defaultModel: 'gemini-4-hydrogen' };
  }
}

export async function saveGeminiApiKey(
  apiKey: string,
  saveToServerEnv = true
): Promise<{ savedToBrowser: boolean; savedToEnvFile: boolean; error?: string }> {
  const cleanKey = apiKey.trim();
  setStoredGeminiApiKey(cleanKey);

  if (!cleanKey) {
    return { savedToBrowser: true, savedToEnvFile: false };
  }

  if (!saveToServerEnv) {
    return { savedToBrowser: true, savedToEnvFile: false };
  }

  try {
    const res = await fetch('/api/ai/save-key', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ apiKey: cleanKey }),
    });
    const data = await res.json();
    if (!res.ok || !data.success) {
      return {
        savedToBrowser: true,
        savedToEnvFile: false,
        error: data.error,
      };
    }
    return {
      savedToBrowser: true,
      savedToEnvFile: Boolean(data.savedToEnvFile),
    };
  } catch {
    return { savedToBrowser: true, savedToEnvFile: false };
  }
}

export async function testGeminiConnection(
  apiKey?: string,
  model?: AIModelPreference
): Promise<{
  success: boolean;
  model?: string;
  latencyMs?: number;
  reply?: string;
  error?: string;
}> {
  const effectiveKey = (apiKey ?? getStoredGeminiApiKey()).trim();
  const targetModel =
    !model || model === 'auto' ? 'gemini-4-hydrogen' : model;
  try {
    const res = await fetch('/api/ai/test-connection', {
      method: 'POST',
      headers: buildAIHeaders(apiKey),
      body: JSON.stringify({
        apiKey: apiKey?.trim() || undefined,
        model: targetModel,
      }),
    });
    const contentType = res.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) {
      if (!effectiveKey) {
        return {
          success: false,
          model: targetModel,
          error: 'در نسخه استاتیک (GitHub Pages) ابتدا کلید Gemini API خود را وارد کنید.',
        };
      }
      return await testConnectionInBrowser(effectiveKey, model);
    }
    const data = await res.json();
    return {
      success: Boolean(res.ok && data.success),
      model: data.model || targetModel,
      latencyMs: data.latencyMs,
      reply: data.reply,
      error: data.error,
    };
  } catch (err: unknown) {
    if (effectiveKey) {
      return await testConnectionInBrowser(effectiveKey, model);
    }
    return {
      success: false,
      model: targetModel,
      error: err instanceof Error ? err.message : 'خطا در برقراری ارتباط با سرور',
    };
  }
}

// پیکربندی Worker محلی برای اجرای بدون نیاز به اینترنت خارجی
if (typeof window !== 'undefined' && pdfjsLib.GlobalWorkerOptions) {
  pdfjsLib.GlobalWorkerOptions.workerSrc =
    pdfWorkerUrl ||
    `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;
}

export interface RenderedPageImage {
  pageNumber: number;
  dataUrl: string;
  width: number;
  height: number;
  /** باکس‌های استخراج‌شده از لایه متنی PDF (در صورت وجود متن قابل انتخاب) */
  textBoxes?: BoundingBoxQuestion[];
}

/**
 * استخراج تقریبی محدوده سوالات از لایه متنی PDF در صورت وجود
 */
async function extractPdfTextQuestionBoxes(
  page: pdfjsLib.PDFPageProxy,
  viewport: pdfjsLib.PageViewport,
  pageIndex: number
): Promise<BoundingBoxQuestion[]> {
  try {
    const textContent = await page.getTextContent();
    interface Anchor {
      qNum: number;
      xNorm: number;
      yNorm: number;
    }
    const anchors: Anchor[] = [];
    const seenNums = new Set<number>();

    for (const rawItem of textContent.items) {
      if (!('str' in rawItem) || !Array.isArray(rawItem.transform)) continue;
      const text = fromFarsiDigits(rawItem.str).trim();
      if (!text) continue;

      // تطبیق شروع شماره سوال مثل "11-" یا "۷." یا "(3)" (و پرهیز از اعداد 4 رقمی یا گزینه‌های 1) 2) 3) 4))
      const m = text.match(/^(?:\((\d{1,3})\)|(\d{1,3})\s*[-–.])(?:\s|$)/);
      if (!m) continue;
      const qNum = Number(m[1] || m[2]);
      if (!Number.isInteger(qNum) || qNum < 1 || qNum > 300 || seenNums.has(qNum)) continue;

      const [, , , , tx, ty] = rawItem.transform;
      const [vx, vy] = viewport.convertToViewportPoint(tx, ty);
      const xNorm = Math.max(0, Math.min(1000, Math.round((vx / viewport.width) * 1000)));
      const yNorm = Math.max(0, Math.min(1000, Math.round((vy / viewport.height) * 1000)));

      // نادیده گرفتن هدر و فوتر خیلی بالا/پایین
      if (yNorm < 40 || yNorm > 960) continue;

      seenNums.add(qNum);
      anchors.push({ qNum, xNorm, yNorm });
    }

    if (anchors.length < 2) return [];

    // تشخیص دوستونی بودن بر اساس موقعیت X شماره‌های سوال
    const rightAnchors = anchors.filter((a) => a.xNorm >= 480);
    const leftAnchors = anchors.filter((a) => a.xNorm < 480);
    const isTwoColumn = rightAnchors.length >= 1 && leftAnchors.length >= 1;

    const buildColumnBoxes = (
      colAnchors: Anchor[],
      xmin: number,
      xmax: number
    ): BoundingBoxQuestion[] => {
      const sorted = [...colAnchors].sort((a, b) => a.yNorm - b.yNorm);
      return sorted.map((anc, idx) => {
        const nextY = idx + 1 < sorted.length ? sorted[idx + 1].yNorm - 14 : 970;
        const ymin = Math.max(0, anc.yNorm - 22);
        const ymax = Math.min(990, Math.max(ymin + 55, nextY));
        return {
          id: `p${pageIndex}-txt-q${anc.qNum}-${idx}`,
          pageIndex,
          questionNumber: anc.qNum,
          ymin,
          xmin,
          ymax,
          xmax,
        };
      });
    };

    if (isTwoColumn) {
      return [
        ...buildColumnBoxes(rightAnchors, 495, 980),
        ...buildColumnBoxes(leftAnchors, 20, 505),
      ];
    }
    return buildColumnBoxes(anchors, 20, 980);
  } catch {
    return [];
  }
}

/**
 * تبدیل صفحات فایل PDF به تصاویر باکیفیت روی Canvas
 */
export async function renderPdfFileToImages(
  file: File,
  maxPages = 8,
  scale = 1.8
): Promise<RenderedPageImage[]> {
  const arrayBuffer = await file.arrayBuffer();
  const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
  const pdfDoc = await loadingTask.promise;
  const numPages = Math.min(pdfDoc.numPages, maxPages);
  const pages: RenderedPageImage[] = [];

  for (let i = 1; i <= numPages; i++) {
    const page = await pdfDoc.getPage(i);
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) continue;

    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);

    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    await page.render({
      canvasContext: ctx,
      viewport,
      canvas,
    }).promise;

    const textBoxes = await extractPdfTextQuestionBoxes(page, viewport, i - 1);

    pages.push({
      pageNumber: i,
      dataUrl: canvas.toDataURL('image/jpeg', 0.9),
      width: canvas.width,
      height: canvas.height,
      textBoxes: textBoxes.length >= 2 ? textBoxes : undefined,
    });
    page.cleanup();
  }

  return pages;
}

/**
 * خواندن فایل تصویر (JPG/PNG/WEBP) و برگرداندن ابعاد و DataURL
 */
export function loadImageFileToRenderedPage(
  file: File,
  pageNumber = 1
): Promise<RenderedPageImage> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      const img = new Image();
      img.onload = () => {
        resolve({
          pageNumber,
          dataUrl,
          width: img.naturalWidth || 1200,
          height: img.naturalHeight || 1600,
        });
      };
      img.onerror = () => reject(new Error('خطا در بارگذاری تصویر انتخاب‌شده'));
      img.src = dataUrl;
    };
    reader.onerror = () => reject(new Error('خطا در خواندن فایل تصویر'));
    reader.readAsDataURL(file);
  });
}

/**
 * برش یک مستطیل نرمال‌شده (0 تا 1000) از تصویر صفحه و تولید تصویر مستقل سوال
 */
export function cropImageFromBoundingBox(
  pageDataUrl: string,
  box: { ymin: number; xmin: number; ymax: number; xmax: number }
): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const w = img.naturalWidth;
      const h = img.naturalHeight;

      // حاشیه امن اضافی (Padding) هنگام برش روی تصویر واقعی:
      // ۱.۵٪ حاشیه افقی و ۱.۵٪ حاشیه عمودی تا هیچ گزینه‌ای لب‌به‌لب نماند
      const padXPx = Math.round(w * 0.015);
      const padYPx = Math.round(h * 0.015);

      const rawX1 = Math.floor((Math.min(box.xmin, box.xmax) / 1000) * w);
      const rawY1 = Math.floor((Math.min(box.ymin, box.ymax) / 1000) * h);
      const rawX2 = Math.ceil((Math.max(box.xmin, box.xmax) / 1000) * w);
      const rawY2 = Math.ceil((Math.max(box.ymin, box.ymax) / 1000) * h);

      const x1 = Math.max(0, rawX1 - padXPx);
      const y1 = Math.max(0, rawY1 - padYPx);
      const x2 = Math.min(w, rawX2 + padXPx);
      const y2 = Math.min(h, rawY2 + padYPx);

      const cropW = Math.max(40, x2 - x1);
      const cropH = Math.max(30, y2 - y1);

      const canvas = document.createElement('canvas');
      canvas.width = cropW;
      canvas.height = cropH;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('خطا در ایجاد بوم برش تصویر'));
        return;
      }

      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, cropW, cropH);
      ctx.drawImage(img, x1, y1, cropW, cropH, 0, 0, cropW, cropH);
      resolve(canvas.toDataURL('image/jpeg', 0.92));
    };
    img.onerror = () => reject(new Error('خطا در بارگذاری تصویر پایه جهت برش'));
    img.src = pageDataUrl;
  });
}

/**
 * الگوریتم کمکی تحلیل تراکم پیکسل‌های افقی و تشخیص دوستونی برای مواقع قطع موقت ارتباط با هوش مصنوعی
 */
export async function detectQuestionBandsVisualFallback(
  pageDataUrl: string,
  pageIndex: number,
  startingQuestionNumber: number
): Promise<BoundingBoxQuestion[]> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const w = img.naturalWidth;
      const h = img.naturalHeight;
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve([]);
        return;
      }
      ctx.drawImage(img, 0, 0);
      const imgData = ctx.getImageData(0, 0, w, h).data;

      const scanStartY = Math.floor(h * 0.08);
      const scanEndY = Math.floor(h * 0.98);

      // بررسی دوستونی بودن صفحه با اندازه‌گیری تراکم جوهر در نوار میانی (۴۸٪ تا ۵۲٪ عرض)
      let centerInkCount = 0;
      let centerTotal = 0;
      const midStart = Math.floor(w * 0.48);
      const midEnd = Math.floor(w * 0.52);
      for (let y = scanStartY; y < scanEndY; y += 3) {
        for (let x = midStart; x < midEnd; x += 2) {
          const idx = (y * w + x) * 4;
          if (imgData[idx] < 215 || imgData[idx + 1] < 215 || imgData[idx + 2] < 215) {
            centerInkCount++;
          }
          centerTotal++;
        }
      }
      const centerDensity = centerTotal > 0 ? centerInkCount / centerTotal : 1;
      const isTwoColumn = centerDensity < 0.008;

      const scanRegion = (xStartRatio: number, xEndRatio: number) => {
        const startX = Math.floor(w * xStartRatio);
        const endX = Math.floor(w * xEndRatio);
        const spanW = Math.max(1, (endX - startX) / 2);
        const rowInk = new Float32Array(h);

        for (let y = scanStartY; y < scanEndY; y++) {
          let darkPixels = 0;
          for (let x = startX; x < endX; x += 2) {
            const idx = (y * w + x) * 4;
            if (imgData[idx] < 220 || imgData[idx + 1] < 220 || imgData[idx + 2] < 220) {
              darkPixels++;
            }
          }
          rowInk[y] = darkPixels / spanW;
        }

        const minGapBetweenQuestions = Math.max(16, Math.floor(h * 0.017));
        const minRawBlockHeight = Math.max(18, Math.floor(h * 0.015));
        const minQuestionHeight = Math.max(48, Math.floor(h * 0.052));
        const inkThreshold = 0.004;

        const rawParts: { startY: number; endY: number; xmin: number; xmax: number }[] = [];
        let inBlock = false;
        let blockStart = 0;
        let blankRun = 0;

        for (let y = scanStartY; y < scanEndY; y++) {
          if (rowInk[y] > inkThreshold) {
            if (!inBlock) {
              inBlock = true;
              blockStart = y;
            }
            blankRun = 0;
          } else if (inBlock) {
            blankRun++;
            if (blankRun >= minGapBetweenQuestions) {
              const blockEnd = y - blankRun;
              if (blockEnd - blockStart >= minRawBlockHeight) {
                rawParts.push({
                  startY: blockStart,
                  endY: blockEnd,
                  xmin: Math.round(xStartRatio * 1000),
                  xmax: Math.round(xEndRatio * 1000),
                });
              }
              inBlock = false;
              blankRun = 0;
            }
          }
        }
        if (inBlock && scanEndY - blockStart >= minRawBlockHeight) {
          rawParts.push({
            startY: blockStart,
            endY: scanEndY,
            xmin: Math.round(xStartRatio * 1000),
            xmax: Math.round(xEndRatio * 1000),
          });
        }

        // ادغام صورت‌سوال‌های کوتاه ۱-۲ خطی با بلوک گزینه‌های بلافاصله بعد از خودشان
        const blocks: typeof rawParts = [];
        for (let i = 0; i < rawParts.length; i++) {
          const cur = rawParts[i];
          const curH = cur.endY - cur.startY;
          if (curH < minQuestionHeight && i + 1 < rawParts.length) {
            const next = rawParts[i + 1];
            if (next.startY - cur.endY < Math.floor(h * 0.04)) {
              rawParts[i + 1] = {
                ...next,
                startY: cur.startY,
              };
              continue;
            }
          }
          if (curH >= minRawBlockHeight) {
            blocks.push(cur);
          }
        }
        return blocks;
      };

      // در صفحات دوستونی RTL: ابتدا ستون راست (0.50..0.98) سپس ستون چپ (0.02..0.50)
      const rawBlocks = isTwoColumn
        ? [...scanRegion(0.5, 0.98), ...scanRegion(0.02, 0.5)]
        : scanRegion(0.025, 0.975);

      const padY = Math.floor(h * 0.006);
      const results: BoundingBoxQuestion[] = rawBlocks.map((b, idx) => ({
        id: `p${pageIndex}-q${startingQuestionNumber + idx}-${idx}`,
        pageIndex,
        questionNumber: startingQuestionNumber + idx,
        ymin: Math.max(0, Math.round(((b.startY - padY) / h) * 1000)),
        xmin: b.xmin,
        ymax: Math.min(1000, Math.round(((b.endY + padY) / h) * 1000)),
        xmax: b.xmax,
      }));

      resolve(results);
    };
    img.onerror = () => resolve([]);
    img.src = pageDataUrl;
  });
}

/**
 * فراخوانی سرور هوش مصنوعی Gemini Vision جهت تشخیص دقیق مستطیل هر سوال در صفحه آزمون
 */
export async function detectQuestionsOnPageWithAI(
  page: RenderedPageImage,
  pageIndex: number,
  startingQuestionNumber: number,
  modelOverride?: AIModelPreference
): Promise<{
  boxes: BoundingBoxQuestion[];
  usedFallback: boolean;
  errorReason?: string;
  modelUsed?: string;
  escalated?: boolean;
}> {
  let errorReason: string | undefined;

  try {
    const response = await fetch('/api/ai/detect-questions', {
      method: 'POST',
      headers: buildAIHeaders(),
      body: JSON.stringify({
        imageBase64: page.dataUrl,
        mimeType: 'image/jpeg',
        pageIndex,
        startingQuestionNumber,
        model: modelOverride || getStoredAIModelPreference(),
      }),
    });

    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) {
      const browserKey = getStoredGeminiApiKey();
      if (browserKey) {
        const direct = await detectQuestionsInBrowser(
          browserKey,
          page.dataUrl,
          startingQuestionNumber,
          modelOverride || getStoredAIModelPreference()
        );
        if (direct.boxes.length > 0) {
          const boxes: BoundingBoxQuestion[] = [];
          for (let i = 0; i < direct.boxes.length; i++) {
            const q = direct.boxes[i];
            const box: BoundingBoxQuestion = {
              id: `p${pageIndex}-q${q.questionNumber}-${i}`,
              pageIndex,
              questionNumber: q.questionNumber,
              ymin: q.ymin,
              xmin: q.xmin,
              ymax: q.ymax,
              xmax: q.xmax,
            };
            box.croppedDataUrl = await cropImageFromBoundingBox(page.dataUrl, box);
            boxes.push(box);
          }
          return {
            boxes,
            usedFallback: false,
            modelUsed: direct.modelUsed,
            escalated: direct.escalated,
          };
        }
      }
      errorReason = 'کلید Gemini API در مرورگر وارد نشده است.';
    } else {
      const data = await response.json();
      if (response.ok && data.success && Array.isArray(data.questions) && data.questions.length > 0) {
        const boxes: BoundingBoxQuestion[] = [];
        for (let i = 0; i < data.questions.length; i++) {
          const q = data.questions[i];
          const ymin = Math.max(0, Math.min(990, Number(q.ymin) || 0));
          const xmin = Math.max(0, Math.min(990, Number(q.xmin) || 20));
          const ymax = Math.max(ymin + 15, Math.min(1000, Number(q.ymax) || 1000));
          const xmax = Math.max(xmin + 20, Math.min(1000, Number(q.xmax) || 980));
          const box: BoundingBoxQuestion = {
            id: `p${pageIndex}-q${q.questionNumber || startingQuestionNumber + i}-${i}`,
            pageIndex,
            questionNumber: Number(q.questionNumber) || startingQuestionNumber + i,
            ymin,
            xmin,
            ymax,
            xmax,
          };
          box.croppedDataUrl = await cropImageFromBoundingBox(page.dataUrl, box);
          boxes.push(box);
        }
        return {
          boxes,
          usedFallback: false,
          modelUsed: data.modelUsed,
          escalated: Boolean(data.escalated),
        };
      }

      errorReason =
        data?.error ||
        'هوش مصنوعی نتوانست باکس سوالی را در این صفحه تشخیص دهد.';
    }
  } catch (err) {
    errorReason =
      err instanceof Error ? err.message : 'خطا در ارتباط با سرور هوش مصنوعی';
    console.warn('AI question detection fallback triggered:', err);
  }

  // در صورت خطای شبکه یا شلوغی موقت سرور، ابتدا از لایه متنی PDF (در صورت وجود) و سپس از تشخیصگر بصری استفاده می‌شود
  const fallbackBoxes =
    page.textBoxes && page.textBoxes.length >= 2
      ? page.textBoxes.map((b) => ({ ...b }))
      : await detectQuestionBandsVisualFallback(
          page.dataUrl,
          pageIndex,
          startingQuestionNumber
        );
  for (const box of fallbackBoxes) {
    box.croppedDataUrl = await cropImageFromBoundingBox(page.dataUrl, box);
  }
  return { boxes: fallbackBoxes, usedFallback: true, errorReason };
}

/**
 * استخراج کلید پاسخنامه با هوش مصنوعی از متن، تصویر یا PDF
 */
export async function extractAnswerKeyWithAI(params: {
  textInput?: string;
  imagesBase64?: { mimeType: string; data: string }[];
  expectedCount?: number;
  model?: AIModelPreference;
}): Promise<{
  answers: Record<number, OptionChoice>;
  explanations: Record<number, string>;
}> {
  const response = await fetch('/api/ai/extract-answers', {
    method: 'POST',
    headers: buildAIHeaders(),
    body: JSON.stringify({
      ...params,
      model: params.model || getStoredAIModelPreference(),
    }),
  });

  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    const browserKey = getStoredGeminiApiKey();
    if (!browserKey) {
      throw new Error('کلید Gemini API در مرورگر تنظیم نشده است.');
    }
    return await extractAnswerKeyInBrowser(browserKey, {
      ...params,
      model: params.model || getStoredAIModelPreference(),
    });
  }

  const data = await response.json();
  if (!response.ok || !data.success) {
    throw new Error(data.error || 'خطا در ارتباط با هوش مصنوعی جهت استخراج پاسخنامه');
  }

  const answers: Record<number, OptionChoice> = {};
  const explanations: Record<number, string> = {};

  for (const item of data.answers || []) {
    const qNum = Number(item.questionNumber);
    const opt = Number(item.correctOption);
    if (qNum >= 1 && (opt === 1 || opt === 2 || opt === 3 || opt === 4)) {
      answers[qNum] = opt as OptionChoice;
      if (item.explanation) {
        explanations[qNum] = String(item.explanation);
      }
    }
  }

  return { answers, explanations };
}

/**
 * تولید یک برگه آزمون نمونه واقعی روی Canvas (صرفاً در صورت کلیک کاربر روی دکمه تست برش هوشمند)
 */
export function generateSampleTestSheetPage(): RenderedPageImage {
  const width = 1200;
  const height = 1750;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, width, height);

  // هدر دفترچه سوال
  ctx.strokeStyle = '#4F46E5';
  ctx.lineWidth = 3;
  ctx.strokeRect(45, 35, width - 90, 95);

  ctx.direction = 'rtl';
  ctx.textAlign = 'right';
  ctx.fillStyle = '#1E1B4B';
  ctx.font = 'bold 28px Vazirmatn, sans-serif';
  ctx.fillText('دفترچه سوالات آزمون زیست‌شناسی دوازدهم — فصل ۱ (مولکول‌های اطلاعاتی و تنظیم عصبی)', width - 75, 82);
  ctx.font = '18px Vazirmatn, sans-serif';
  ctx.fillStyle = '#475569';
  ctx.fillText('تعداد سوال: ۵ سوال استاندارد | زمان پیشنهادی: ۱۰ دقیقه', width - 75, 115);

  const sampleQuestions = [
    {
      num: 1,
      stem: '۱- کدام مورد زیر ساختار اصلی یک نورون (یاخته عصبی) را به درستی از ورودی پیام تا خروجی نشان می‌دهد؟',
      options: ['۱) دندریت – جسم سلولی – آکسون', '۲) جسم سلولی – آکسون – دندریت', '۳) آکسون – دندریت – جسم سلولی', '۴) دندریت – پایانه آکسون – غلاف میلین'],
    },
    {
      num: 2,
      stem: '۲- در هنگام پتانسیل استراحت غشای یاخته عصبی، فعالیت پمپ سدیم-پتاسیم چگونه است؟',
      options: ['۱) ۳ یون سدیم به درون و ۲ یون پتاسیم به بیرون', '۲) ۳ یون سدیم به بیرون و ۲ یون پتاسیم به درون یاخته با مصرف ATP', '۳) انتشار تسهیل‌شده بدون مصرف انرژی زیستی', '۴) باز شدن کانال‌های دریچه‌دار ولتاژی سدیمی'],
    },
    {
      num: 3,
      stem: '۳- غلاف میلین در دستگاه عصبی محیطی توسط کدام یاخته‌ها ساخته می‌شود و چه نقشی دارد؟',
      options: ['۱) الیگودندروسیت – کاهش سرعت هدایت پیام', '۲) یاخته‌های شوان – افزایش سرعت هدایت جهشی در گره‌های رانویه', '۳) آستروسیت – تغذیه مستقیم آکسون‌ها', '۴) میکروگلیا – دفاع بیگانه‌خواری در گره رانویه'],
    },
    {
      num: 4,
      stem: '۴- آنزیم هلیکاز در فرآیند همانندسازی دنا (DNA) کدام پیوندها را می‌شکند؟',
      options: ['۱) پیوند فسفودی‌استر بین نوکلئوتیدهای مجاور', '۲) پیوند هیدروژنی بین بازهای مکمل دو رشته دنا', '۳) پیوند کووالانسی بین قند دئوکسی‌ریبوز و فسفات', '۴) پیوند پپتیدی بین پروتئین‌های هیستونی'],
    },
    {
      num: 5,
      stem: '۵- در سیناپس‌های شیمیایی، خروج ناقل عصبی از پایانه آکسون از طریق چه فرآیندی صورت می‌گیرد؟',
      options: ['۱) انتقال فعال اولیه', '۲) اگزوسیتوز (برون‌رانی) وابسته به ورود یون کلسیم', '۳) آندوسیتوز با میانجی گیرنده', '۴) انتشار ساده از خلال فسفولیپیدها'],
    },
  ];

  let currentY = 185;
  sampleQuestions.forEach((q) => {
    // کادر ملایم دور هر سوال جهت وضوح بالا
    ctx.fillStyle = '#F8FAFC';
    ctx.fillRect(60, currentY, width - 120, 250);
    ctx.strokeStyle = '#94A3B8';
    ctx.lineWidth = 2;
    ctx.strokeRect(60, currentY, width - 120, 250);

    // نوار عمودی بنفش در سمت راست و چپ باکس سوال
    ctx.fillStyle = '#6338F9';
    ctx.fillRect(width - 68, currentY, 8, 250);
    ctx.fillRect(60, currentY, 6, 250);

    // دایره شماره سوال
    ctx.fillStyle = '#6338F9';
    ctx.beginPath();
    ctx.arc(width - 98, currentY + 42, 18, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#FFFFFF';
    ctx.textAlign = 'center';
    ctx.font = 'bold 19px Vazirmatn, sans-serif';
    ctx.fillText(toFarsiDigits(q.num), width - 98, currentY + 49);

    // متن صورت سوال
    ctx.textAlign = 'right';
    ctx.fillStyle = '#0F172A';
    ctx.font = 'bold 22px Vazirmatn, sans-serif';
    ctx.fillText(q.stem, width - 130, currentY + 48);

    // گزینه‌ها در دو ردیف
    ctx.font = '20px Vazirmatn, sans-serif';
    ctx.fillStyle = '#334155';
    ctx.fillText(q.options[0], width - 115, currentY + 125);
    ctx.fillText(q.options[1], width - 580, currentY + 125);
    ctx.fillText(q.options[2], width - 115, currentY + 195);
    ctx.fillText(q.options[3], width - 580, currentY + 195);

    currentY += 305;
  });

  return {
    pageNumber: 1,
    dataUrl: canvas.toDataURL('image/jpeg', 0.92),
    width,
    height,
  };
}

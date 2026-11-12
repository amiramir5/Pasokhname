import React, { useState, useRef, useEffect } from 'react';
import {
  ArrowRight,
  Sparkles,
  FileText,
  Scissors,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Plus,
  Trash2,
  Wand2,
  Save,
  FolderOpen,
  KeyRound,
  Wifi,
} from 'lucide-react';
import {
  DifficultyLevel,
  OptionChoice,
  BoundingBoxQuestion,
  SavedAnswerKeyTemplate,
} from '../types/exam';
import {
  toFarsiDigits,
  parseFarsiInt,
  parseAnswerKeyFromTextLocal,
  getOptionLabel,
} from '../utils/farsi';
import {
  renderPdfFileToImages,
  loadImageFileToRenderedPage,
  extractAnswerKeyWithAI,
  detectQuestionsOnPageWithAI,
  detectQuestionBandsVisualFallback,
  cropImageFromBoundingBox,
  generateSampleTestSheetPage,
  RenderedPageImage,
  fetchAIStatus,
  saveGeminiApiKey,
  testGeminiConnection,
  getStoredGeminiApiKey,
} from '../utils/pdfAndVision';

interface CreateExamViewProps {
  initialFocusMode?: 'form' | 'ai_key' | 'ai_slicer';
  optionLabelStyle: 'numeric' | 'alphabetic';
  defaultNegativeMarking: boolean;
  defaultShowScoreImmediately: boolean;
  savedAnswerKeys: SavedAnswerKeyTemplate[];
  onSaveAnswerKeyTemplate: (template: Omit<SavedAnswerKeyTemplate, 'id' | 'createdAt'>) => void;
  onCreateExam: (config: {
    title: string;
    subject: string;
    topic: string;
    questionCount: number;
    durationMinutes: number;
    difficulty: DifficultyLevel;
    hasNegativeMarking: boolean;
    showScoreImmediately: boolean;
    answerKey: Record<number, OptionChoice>;
    explanations: Record<number, string>;
    croppedImagesByQuestion: Record<number, string>;
  }) => void;
  onCancel: () => void;
}

const PRESET_SUBJECTS = [
  'زیست‌شناسی',
  'ریاضیات',
  'فیزیک',
  'شیمی',
  ' زمین‌شناسی',
  'ادبیات فارسی',
  'عربی',
  'دینی و اندیشه',
  'زبان انگلیسی',
  'سایر دروس',
];

export const CreateExamView: React.FC<CreateExamViewProps> = ({
  initialFocusMode = 'form',
  optionLabelStyle,
  defaultNegativeMarking,
  defaultShowScoreImmediately,
  savedAnswerKeys,
  onSaveAnswerKeyTemplate,
  onCreateExam,
  onCancel,
}) => {
  // فرم مشخصات آزمون
  const [title, setTitle] = useState<string>('');
  const [subject, setSubject] = useState<string>('زیست‌شناسی');
  const [topic, setTopic] = useState<string>('');
  const [questionCountStr, setQuestionCountStr] = useState<string>('۲۰');
  const [durationStr, setDurationStr] = useState<string>('۲۰');
  const [difficulty, setDifficulty] = useState<DifficultyLevel>('متوسط');
  const [hasNegativeMarking, setHasNegativeMarking] = useState<boolean>(defaultNegativeMarking);
  const [showScoreImmediately, setShowScoreImmediately] = useState<boolean>(
    defaultShowScoreImmediately
  );
  const [formError, setFormError] = useState<string | null>(null);

  // پنل سمت چپ: تب بین «استخراج پاسخنامه» و «برش هوشمند سوالات PDF/تصویر»
  const [studioMode, setStudioMode] = useState<'answer_key' | 'question_slicer'>(
    initialFocusMode === 'ai_slicer' ? 'question_slicer' : 'answer_key'
  );

  // استخراج کلید پاسخنامه
  const [keySourceTab, setKeySourceTab] = useState<'file' | 'image' | 'text'>('file');
  const [rawKeyText, setRawKeyText] = useState<string>('');
  const [answerKey, setAnswerKey] = useState<Record<number, OptionChoice>>({});
  const [explanations, setExplanations] = useState<Record<number, string>>({});
  const [isExtractingKey, setIsExtractingKey] = useState<boolean>(false);
  const [keyStatusMessage, setKeyStatusMessage] = useState<{
    type: 'success' | 'error' | 'info';
    text: string;
  } | null>(null);
  const [showManualKeyGrid, setShowManualKeyGrid] = useState<boolean>(false);

  // برش هوشمند سوالات با بینایی ماشین
  const [renderedPages, setRenderedPages] = useState<RenderedPageImage[]>([]);
  const [detectedBoxes, setDetectedBoxes] = useState<BoundingBoxQuestion[]>([]);
  const [isSlicingQuestions, setIsSlicingQuestions] = useState<boolean>(false);
  const [slicerStatus, setSlicerStatus] = useState<{
    type: 'success' | 'error' | 'info';
    text: string;
  } | null>(null);
  const [selectedBoxId, setSelectedBoxId] = useState<string | null>(null);

  // وضعیت کلید Gemini API برای نمایش راهنمای سریع در صورت نبود کلید
  const [hasAnyAIKey, setHasAnyAIKey] = useState<boolean>(() => Boolean(getStoredGeminiApiKey()));
  const [inlineApiKey, setInlineApiKey] = useState<string>('');
  const [isTestingInlineKey, setIsTestingInlineKey] = useState<boolean>(false);
  const [inlineKeyMsg, setInlineKeyMsg] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  useEffect(() => {
    fetchAIStatus().then((st) => {
      setHasAnyAIKey(st.hasServerKey || st.hasBrowserKey);
    });
  }, []);

  const handleQuickSaveAndTestKey = async () => {
    const trimmed = inlineApiKey.trim();
    if (!trimmed) {
      setInlineKeyMsg({ type: 'error', text: 'لطفاً کلید Gemini API خود را وارد کنید.' });
      return;
    }
    setIsTestingInlineKey(true);
    setInlineKeyMsg(null);
    try {
      await saveGeminiApiKey(trimmed, true);
      const testRes = await testGeminiConnection(trimmed);
      if (testRes.success) {
        setHasAnyAIKey(true);
        setInlineKeyMsg({
          type: 'success',
          text: `متصل شد (${testRes.model} · ${toFarsiDigits(testRes.latencyMs ?? 0)} میلی‌ثانیه)`,
        });
      } else {
        setInlineKeyMsg({
          type: 'error',
          text: testRes.error || 'کلید معتبر نیست یا اتصال برقرار نشد.',
        });
      }
    } catch (err: unknown) {
      setInlineKeyMsg({
        type: 'error',
        text: err instanceof Error ? err.message : 'خطا در تست اتصال کلید',
      });
    } finally {
      setIsTestingInlineKey(false);
    }
  };

  const keyFileInputRef = useRef<HTMLInputElement>(null);
  const keyImageInputRef = useRef<HTMLInputElement>(null);
  const slicerFileInputRef = useRef<HTMLInputElement>(null);

  const questionCount = Math.max(1, Math.min(200, parseFarsiInt(questionCountStr, 20)));
  const durationMinutes = Math.max(1, Math.min(360, parseFarsiInt(durationStr, 20)));

  // پردازش آپلود فایل PDF یا تصویر برای استخراج کلید پاسخنامه
  const handleKeyFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsExtractingKey(true);
    setKeyStatusMessage({
      type: 'info',
      text: `در حال پردازش فایل «${file.name}» و استخراج کلید با هوش مصنوعی...`,
    });

    try {
      let imagesPayload: { mimeType: string; data: string }[] = [];
      if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
        const pages = await renderPdfFileToImages(file, 4, 1.6);
        imagesPayload = pages.map((p) => ({ mimeType: 'image/jpeg', data: p.dataUrl }));
      } else {
        const page = await loadImageFileToRenderedPage(file, 1);
        imagesPayload = [{ mimeType: 'image/jpeg', data: page.dataUrl }];
      }

      const result = await extractAnswerKeyWithAI({
        imagesBase64: imagesPayload,
        expectedCount: questionCount,
      });

      const count = Object.keys(result.answers).length;
      if (count > 0) {
        setAnswerKey((prev) => ({ ...prev, ...result.answers }));
        setExplanations((prev) => ({ ...prev, ...result.explanations }));
        if (count > questionCount) {
          setQuestionCountStr(toFarsiDigits(count));
        }
        setShowManualKeyGrid(true);
        setKeyStatusMessage({
          type: 'success',
          text: `کلید ${toFarsiDigits(count)} سوال با موفقیت توسط هوش مصنوعی استخراج شد.`,
        });
      } else {
        setKeyStatusMessage({
          type: 'error',
          text: 'کلیدی در این فایل یافت نشد. می‌توانید از تب «از متن» یا جدول دستی استفاده کنید.',
        });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'خطا در استخراج پاسخنامه';
      setKeyStatusMessage({ type: 'error', text: msg });
    } finally {
      setIsExtractingKey(false);
      e.target.value = '';
    }
  };

  // استخراج کلید از متن تایپ‌شده (هم پارسر آنی محلی و هم هوش مصنوعی برای متن‌های تشریحی پیچیده)
  const handleExtractKeyFromText = async (useAI: boolean) => {
    if (!rawKeyText.trim()) {
      setKeyStatusMessage({ type: 'error', text: 'لطفاً ابتدا متن کلید یا پاسخنامه را وارد کنید.' });
      return;
    }

    const localParsed = parseAnswerKeyFromTextLocal(rawKeyText, 200);
    const localCount = Object.keys(localParsed).length;

    if (!useAI && localCount > 0) {
      setAnswerKey((prev) => ({ ...prev, ...localParsed }));
      setShowManualKeyGrid(true);
      setKeyStatusMessage({
        type: 'success',
        text: `${toFarsiDigits(localCount)} کلید به صورت آنی از متن استخراج و ثبت شد.`,
      });
      return;
    }

    setIsExtractingKey(true);
    setKeyStatusMessage({
      type: 'info',
      text: 'در حال تحلیل متن پاسخنامه با هوش مصنوعی...',
    });

    try {
      const aiResult = await extractAnswerKeyWithAI({
        textInput: rawKeyText,
        expectedCount: questionCount,
      });
      const aiCount = Object.keys(aiResult.answers).length;
      if (aiCount > 0) {
        setAnswerKey((prev) => ({ ...prev, ...aiResult.answers }));
        setExplanations((prev) => ({ ...prev, ...aiResult.explanations }));
        setShowManualKeyGrid(true);
        setKeyStatusMessage({
          type: 'success',
          text: `کلید ${toFarsiDigits(aiCount)} سوال با هوش مصنوعی از متن استخراج شد.`,
        });
      } else if (localCount > 0) {
        setAnswerKey((prev) => ({ ...prev, ...localParsed }));
        setShowManualKeyGrid(true);
        setKeyStatusMessage({
          type: 'success',
          text: `${toFarsiDigits(localCount)} کلید از متن استخراج شد.`,
        });
      } else {
        setKeyStatusMessage({
          type: 'error',
          text: 'پاسخی در متن پیدا نشد. فرمت پیشنهادی: ۱-۳، ۲-۱، ۳-۴',
        });
      }
    } catch {
      if (localCount > 0) {
        setAnswerKey((prev) => ({ ...prev, ...localParsed }));
        setShowManualKeyGrid(true);
        setKeyStatusMessage({
          type: 'success',
          text: `${toFarsiDigits(localCount)} کلید توسط مفسر داخلی استخراج شد.`,
        });
      } else {
        setKeyStatusMessage({
          type: 'error',
          text: 'خطا در تحلیل متن. لطفاً کلیدها را با فرمت ۱-۳، ۲-۱ وارد کنید.',
        });
      }
    } finally {
      setIsExtractingKey(false);
    }
  };

  // پردازش آپلود فایل PDF یا تصویر سوالات جهت برش خودکار هر سوال (Question Slicer)
  const handleQuestionSlicerUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setIsSlicingQuestions(true);
    setSlicerStatus({
      type: 'info',
      text: 'در حال رندر صفحات با کیفیت بالا و تشخیص باکس هر سوال با بینایی ماشین...',
    });

    try {
      const allPages: RenderedPageImage[] = [];
      for (let i = 0; i < files.length; i++) {
        const f = files[i];
        if (f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf')) {
          const pdfPages = await renderPdfFileToImages(f, 20, 1.8);
          allPages.push(...pdfPages);
        } else {
          const imgPage = await loadImageFileToRenderedPage(f, allPages.length + 1);
          allPages.push(imgPage);
        }
      }

      setRenderedPages(allPages);
      const allBoxes: BoundingBoxQuestion[] = [];
      const usedNumbers = new Set<number>();
      let nextQNum = 1;
      let fallbackPagesCount = 0;
      let lastFallbackError: string | undefined;
      let lastModelUsed: string | undefined;
      let anyEscalated = false;

      for (let pIdx = 0; pIdx < allPages.length; pIdx++) {
        const { boxes, usedFallback, errorReason, modelUsed, escalated } =
          await detectQuestionsOnPageWithAI(allPages[pIdx], pIdx, nextQNum);

        if (usedFallback) {
          fallbackPagesCount++;
          if (errorReason) lastFallbackError = errorReason;
        }
        if (modelUsed) lastModelUsed = modelUsed;
        if (escalated) anyEscalated = true;

        for (const b of boxes) {
          // حفظ شماره سوال واقعی تشخیص‌داده‌شده توسط AI در صورت معتبر و یکتا بودن
          let assignedNum = b.questionNumber;
          if (!assignedNum || assignedNum < 1 || usedNumbers.has(assignedNum)) {
            while (usedNumbers.has(nextQNum)) nextQNum++;
            assignedNum = nextQNum;
          }
          usedNumbers.add(assignedNum);
          nextQNum = Math.max(nextQNum, assignedNum + 1);
          allBoxes.push({ ...b, questionNumber: assignedNum });
        }
      }

      setDetectedBoxes(allBoxes);
      if (allBoxes.length > 0) {
        setSelectedBoxId(allBoxes[0].id);
        setQuestionCountStr(toFarsiDigits(Math.max(questionCount, allBoxes.length)));
        if (fallbackPagesCount > 0) {
          setSlicerStatus({
            type: 'error',
            text: `هشدار: هوش مصنوعی در ${toFarsiDigits(
              fallbackPagesCount
            )} صفحه در دسترس نبود (${
              lastFallbackError || 'کلید API تنظیم نشده'
            }) و برش با الگوریتم ساده انجام شد. برای برش دقیق، کلید API را وارد کنید.`,
          });
        } else {
          const modelNote = lastModelUsed
            ? ` (مدل: ${lastModelUsed}${anyEscalated ? ' · ارتقای هوشمند فعال شد' : ''})`
            : '';
          setSlicerStatus({
            type: 'success',
            text: `${toFarsiDigits(allBoxes.length)} سوال به صورت خودکار تشخیص داده شد و برش خورد!${modelNote} می‌توانید کادر هر سوال را بازبینی یا تنظیم کنید.`,
          });
        }
      } else {
        setSlicerStatus({
          type: 'error',
          text:
            lastFallbackError ||
            'سوالی به صورت خودکار تفکیک نشد. می‌توانید با دکمه «افزودن باکس برش» کادر سوال را مشخص کنید.',
        });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'خطا در برش فایل سوالات';
      setSlicerStatus({ type: 'error', text: msg });
    } finally {
      setIsSlicingQuestions(false);
      e.target.value = '';
    }
  };

  // تست سریع برش هوشمند با برگه نمونه ۵ سوالی استاندارد
  const handleGenerateAndSliceSampleSheet = async () => {
    setIsSlicingQuestions(true);
    if (!title.trim()) {
      setTitle('آزمون زیست‌شناسی دوازدهم');
      setSubject('زیست‌شناسی');
      setTopic('فصل ۱: مولکول‌های اطلاعاتی و تنظیم عصبی');
      setQuestionCountStr(toFarsiDigits(5));
      setDurationStr(toFarsiDigits(10));
    }
    setAnswerKey((prev) => ({
      ...prev,
      1: 1,
      2: 2,
      3: 2,
      4: 2,
      5: 2,
    }));

    setSlicerStatus({
      type: 'info',
      text: 'در حال تولید برگه نمونه زیست‌شناسی و برش خودکار سوالات با بینایی ماشین...',
    });

    try {
      const samplePage = generateSampleTestSheetPage();
      setRenderedPages([samplePage]);

      const rawBoxes = await detectQuestionBandsVisualFallback(samplePage.dataUrl, 0, 1);
      const numbered: BoundingBoxQuestion[] = [];
      for (let i = 0; i < rawBoxes.length; i++) {
        const b = { ...rawBoxes[i], questionNumber: i + 1 };
        b.croppedDataUrl = await cropImageFromBoundingBox(samplePage.dataUrl, b);
        numbered.push(b);
      }

      setDetectedBoxes(numbered);
      if (numbered.length > 0) {
        setSelectedBoxId(numbered[0].id);
        setQuestionCountStr(toFarsiDigits(numbered.length));
      }

      setSlicerStatus({
        type: 'success',
        text: `برگه نمونه ساخته شد و ${toFarsiDigits(numbered.length)} سوال آن به همراه کلید به صورت خودکار برش خورد!`,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'خطا در برش برگه نمونه';
      setSlicerStatus({ type: 'error', text: msg });
    } finally {
      setIsSlicingQuestions(false);
    }
  };

  // تغییر ابعاد باکس برش یک سوال توسط کاربر
  const handleUpdateBoxBounds = async (
    boxId: string,
    field: 'ymin' | 'ymax' | 'xmin' | 'xmax',
    newValue: number
  ) => {
    const target = detectedBoxes.find((b) => b.id === boxId);
    if (!target) return;
    const page = renderedPages[target.pageIndex];
    if (!page) return;

    const updatedBox: BoundingBoxQuestion = {
      ...target,
      [field]: Math.max(0, Math.min(1000, newValue)),
    };
    updatedBox.croppedDataUrl = await cropImageFromBoundingBox(page.dataUrl, updatedBox);

    setDetectedBoxes((prev) => prev.map((b) => (b.id === boxId ? updatedBox : b)));
  };

  const handleUpdateBoxQuestionNumber = (boxId: string, qNum: number) => {
    const safeNum = Math.max(1, Math.min(500, qNum));
    setDetectedBoxes((prev) =>
      prev.map((b) => (b.id === boxId ? { ...b, questionNumber: safeNum } : b))
    );
  };

  const handleAddManualCropBox = async () => {
    if (renderedPages.length === 0) return;
    const pageIndex = 0;
    const newQNum = detectedBoxes.length + 1;
    const newBox: BoundingBoxQuestion = {
      id: `manual-${Date.now()}`,
      pageIndex,
      questionNumber: newQNum,
      ymin: 150,
      xmin: 30,
      ymax: 400,
      xmax: 970,
    };
    newBox.croppedDataUrl = await cropImageFromBoundingBox(renderedPages[pageIndex].dataUrl, newBox);
    setDetectedBoxes((prev) => [...prev, newBox]);
    setSelectedBoxId(newBox.id);
  };

  const handleDeleteCropBox = (boxId: string) => {
    setDetectedBoxes((prev) => {
      const filtered = prev.filter((b) => b.id !== boxId);
      return filtered.map((b, idx) => ({ ...b, questionNumber: idx + 1 }));
    });
  };

  const handleSaveCurrentKeyAsTemplate = () => {
    const keyCount = Object.keys(answerKey).length;
    if (keyCount === 0) {
      setKeyStatusMessage({
        type: 'error',
        text: 'ابتدا حداقل کلید یک سوال را وارد یا استخراج کنید.',
      });
      return;
    }
    onSaveAnswerKeyTemplate({
      title: title.trim() || `کلید ${subject} (${toFarsiDigits(questionCount)} سوالی)`,
      subject,
      questionCount,
      answers: answerKey,
      explanations,
    });
    setKeyStatusMessage({
      type: 'success',
      text: 'این کلید پاسخنامه در بخش «پاسخنامه‌ها» ذخیره شد.',
    });
  };

  const handleSubmitCreateExam = (e: React.FormEvent) => {
    e.preventDefault();
    const finalTitle = title.trim();
    if (!finalTitle) {
      setFormError('لطفاً عنوان آزمون را وارد کنید (مثلاً: آزمون زیست‌شناسی دوازدهم).');
      return;
    }
    setFormError(null);

    const croppedImagesByQuestion: Record<number, string> = {};
    for (const box of detectedBoxes) {
      if (box.croppedDataUrl && box.questionNumber >= 1) {
        croppedImagesByQuestion[box.questionNumber] = box.croppedDataUrl;
      }
    }

    onCreateExam({
      title: finalTitle,
      subject: subject.trim() || 'عمومی',
      topic: topic.trim(),
      questionCount,
      durationMinutes,
      difficulty,
      hasNegativeMarking,
      showScoreImmediately,
      answerKey,
      explanations,
      croppedImagesByQuestion,
    });
  };

  const enteredKeysCount = Object.keys(answerKey).length;

  return (
    <div className="space-y-6">
      {/* نوار بازگشت */}
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={onCancel}
          className="inline-flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-[#6338F9] transition-colors cursor-pointer"
        >
          <ArrowRight className="w-4 h-4" />
          <span>بازگشت به داشبورد</span>
        </button>
      </div>

      {/* چیدمان دو ستونی منطبق با بخش میانی تصویر مرجع ۲ */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* ستون راست: فرم ایجاد آزمون جدید */}
        <form
          onSubmit={handleSubmitCreateExam}
          className="lg:col-span-5 bg-white rounded-2xl border border-indigo-100/80 p-6 space-y-5"
        >
          <div className="flex items-center justify-between border-b border-slate-100 pb-4">
            <h1 className="text-lg font-bold text-slate-900">ایجاد آزمون جدید</h1>
            <span className="text-xs text-slate-400 tabular-farsi">
              تنظیمات پاسخبرگ
            </span>
          </div>

          {formError && (
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{formError}</span>
            </div>
          )}

          {/* عنوان آزمون */}
          <div className="space-y-1.5">
            <label htmlFor="exam-title" className="block text-xs font-semibold text-slate-700">
              عنوان آزمون
            </label>
            <input
              id="exam-title"
              type="text"
              value={title}
              onChange={(e) => {
                setTitle(e.target.value);
                if (formError) setFormError(null);
              }}
              placeholder="آزمون زیست شناسی دوازدهم"
              className="w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50/50 focus:bg-white focus:border-[#6338F9] focus:outline-none text-sm text-slate-900 transition-colors"
            />
          </div>

          {/* انتخاب درس (برای نمودار پیشرفت هر درس) و مبحث/فصل */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div className="space-y-1.5">
              <label htmlFor="exam-subject" className="block text-xs font-semibold text-slate-700">
                نام درس (جهت نمودار پیشرفت)
              </label>
              <select
                id="exam-subject"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-slate-50/50 focus:bg-white focus:border-[#6338F9] focus:outline-none text-sm text-slate-900"
              >
                {PRESET_SUBJECTS.map((subj) => (
                  <option key={subj} value={subj}>
                    {subj}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="exam-topic" className="block text-xs font-semibold text-slate-700">
                مبحث / فصل
              </label>
              <input
                id="exam-topic"
                type="text"
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                placeholder="گفتار ۱: تنظیم عصبی"
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-slate-50/50 focus:bg-white focus:border-[#6338F9] focus:outline-none text-sm text-slate-900"
              />
            </div>
          </div>

          {/* تعداد سوال و زمان (با نمایش اعداد فارسی) */}
          <div className="grid grid-cols-2 gap-3.5">
            <div className="space-y-1.5">
              <label htmlFor="exam-qcount" className="block text-xs font-semibold text-slate-700">
                تعداد سوال
              </label>
              <input
                id="exam-qcount"
                type="text"
                inputMode="numeric"
                value={toFarsiDigits(questionCountStr)}
                onChange={(e) => setQuestionCountStr(toFarsiDigits(e.target.value))}
                className="w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50/50 focus:bg-white focus:border-[#6338F9] focus:outline-none text-sm font-bold text-center text-slate-900 tabular-farsi"
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="exam-duration" className="block text-xs font-semibold text-slate-700">
                زمان (دقیقه)
              </label>
              <input
                id="exam-duration"
                type="text"
                inputMode="numeric"
                value={toFarsiDigits(durationStr)}
                onChange={(e) => setDurationStr(toFarsiDigits(e.target.value))}
                className="w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50/50 focus:bg-white focus:border-[#6338F9] focus:outline-none text-sm font-bold text-center text-slate-900 tabular-farsi"
              />
            </div>
          </div>

          {/* سطح سختی */}
          <div className="space-y-1.5">
            <label htmlFor="exam-difficulty" className="block text-xs font-semibold text-slate-700">
              سطح سختی
            </label>
            <select
              id="exam-difficulty"
              value={difficulty}
              onChange={(e) => setDifficulty(e.target.value as DifficultyLevel)}
              className="w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50/50 focus:bg-white focus:border-[#6338F9] focus:outline-none text-sm text-slate-900"
            >
              <option value="آسان">آسان</option>
              <option value="متوسط">متوسط</option>
              <option value="سخت">سخت</option>
            </select>
          </div>

          {/* سوییچ‌های تنظیمات تصحیح */}
          <div className="space-y-3 pt-1">
            <label className="flex items-center justify-between cursor-pointer">
              <span className="text-xs font-semibold text-slate-700">
                نمایش نمره و درصد هنگام اتمام
              </span>
              <button
                type="button"
                role="switch"
                aria-checked={showScoreImmediately}
                onClick={() => setShowScoreImmediately((v) => !v)}
                className={`w-11 h-6 rounded-full transition-colors p-0.5 flex items-center cursor-pointer ${
                  showScoreImmediately ? 'bg-[#6338F9] justify-start' : 'bg-slate-300 justify-end'
                }`}
              >
                <span className="w-5 h-5 rounded-full bg-white shadow-xs block" />
              </button>
            </label>

            <label className="flex items-center justify-between cursor-pointer">
              <span className="text-xs font-semibold text-slate-700">
                محاسبه نمره منفی استاندارد (یک‌سوم) در کنار درصد خام
              </span>
              <button
                type="button"
                role="switch"
                aria-checked={hasNegativeMarking}
                onClick={() => setHasNegativeMarking((v) => !v)}
                className={`w-11 h-6 rounded-full transition-colors p-0.5 flex items-center cursor-pointer ${
                  hasNegativeMarking ? 'bg-[#6338F9] justify-start' : 'bg-slate-300 justify-end'
                }`}
              >
                <span className="w-5 h-5 rounded-full bg-white shadow-xs block" />
              </button>
            </label>
          </div>

          {/* خلاصه وضعیت اتصال کلید و سوالات برش‌خورده */}
          <div className="p-3.5 rounded-xl bg-[#F8F6FF] border border-indigo-100 space-y-2 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-slate-600">کلید پاسخنامه متصل‌شده:</span>
              <span className="font-bold text-[#6338F9] tabular-farsi">
                {enteredKeysCount > 0
                  ? `${toFarsiDigits(enteredKeysCount)} از ${toFarsiDigits(questionCount)} سوال`
                  : 'می‌توانید الان یا پایان آزمون وارد کنید'}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-600">سوالات برش‌خورده تصویری:</span>
              <span className="font-bold text-emerald-700 tabular-farsi">
                {detectedBoxes.length > 0
                  ? `${toFarsiDigits(detectedBoxes.length)} باکس سوال آماده نمایش`
                  : 'پاسخبرگ استاندارد (بدون تصویر سوال)'}
              </span>
            </div>
          </div>

          {/* دکمه ساخت و شروع آزمون */}
          <button
            type="submit"
            className="w-full py-3.5 px-5 rounded-xl bg-[#6338F9] hover:bg-[#5228E8] text-white font-bold text-sm flex items-center justify-center gap-2 shadow-sm shadow-[#6338F9]/25 transition-all cursor-pointer"
          >
            <Sparkles className="w-4 h-4" />
            <span>ساخت آزمون</span>
          </button>
        </form>

        {/* ستون چپ: استودیو هوش مصنوعی (استخراج پاسخنامه + برش سوالات از PDF/عکس) */}
        <div className="lg:col-span-7 bg-white rounded-2xl border border-indigo-100/80 p-6 space-y-5">
          {/* سوییچر بین استخراج پاسخنامه و برش خودکار سوالات */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
            <div className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-[#6338F9]" />
              <h2 className="text-base font-bold text-slate-900">
                دستیار هوشمند پاسخنامه و برش سوالات
              </h2>
            </div>

            <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-xl">
              <button
                type="button"
                onClick={() => setStudioMode('answer_key')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 cursor-pointer ${
                  studioMode === 'answer_key'
                    ? 'bg-[#6338F9] text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <FileText className="w-3.5 h-3.5" />
                <span>استخراج پاسخنامه</span>
              </button>
              <button
                type="button"
                onClick={() => setStudioMode('question_slicer')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 cursor-pointer ${
                  studioMode === 'question_slicer'
                    ? 'bg-[#6338F9] text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Scissors className="w-3.5 h-3.5" />
                <span>برش سوالات از PDF / عکس</span>
              </button>
            </div>
          </div>

          {!hasAnyAIKey && (
            <div className="p-3.5 rounded-xl bg-amber-50/90 border border-amber-200 space-y-2.5">
              <div className="flex items-start gap-2 text-xs text-amber-900">
                <KeyRound className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <span className="font-bold">کلید Gemini API تنظیم نشده است: </span>
                  <span>
                    برای عملکرد دقیق موتور بینایی برش سوالات و استخراج هوشمند پاسخنامه، کلید API خود را اینجا وارد و تست کنید.
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <input
                  type="password"
                  dir="ltr"
                  value={inlineApiKey}
                  onChange={(e) => setInlineApiKey(e.target.value)}
                  placeholder="AIzaSy..."
                  className="flex-1 min-w-[200px] px-3 py-2 rounded-lg border border-amber-300 bg-white text-xs font-mono focus:outline-none focus:border-[#6338F9]"
                />
                <button
                  type="button"
                  disabled={isTestingInlineKey}
                  onClick={handleQuickSaveAndTestKey}
                  className="px-3.5 py-2 rounded-lg bg-[#6338F9] hover:bg-[#5228E8] disabled:opacity-60 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                >
                  {isTestingInlineKey ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Wifi className="w-3.5 h-3.5" />
                  )}
                  <span>ذخیره و تست اتصال</span>
                </button>
              </div>
              {inlineKeyMsg && (
                <p
                  className={`text-[11px] font-semibold ${
                    inlineKeyMsg.type === 'success' ? 'text-emerald-700' : 'text-rose-700'
                  }`}
                >
                  {inlineKeyMsg.text}
                </p>
              )}
            </div>
          )}

          {studioMode === 'answer_key' ? (
            <div className="space-y-5">
              {/* تب‌های سه گانه منطبق با تصویر مرجع ۲: از فایل | از تصویر | از متن */}
              <div className="grid grid-cols-3 gap-1.5 p-1.5 bg-[#F6F5FC] rounded-xl border border-indigo-100/60">
                <button
                  type="button"
                  onClick={() => setKeySourceTab('file')}
                  className={`py-2 px-3 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                    keySourceTab === 'file'
                      ? 'bg-[#6338F9] text-white shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  از فایل
                </button>
                <button
                  type="button"
                  onClick={() => setKeySourceTab('image')}
                  className={`py-2 px-3 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                    keySourceTab === 'image'
                      ? 'bg-[#6338F9] text-white shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  از تصویر
                </button>
                <button
                  type="button"
                  onClick={() => setKeySourceTab('text')}
                  className={`py-2 px-3 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                    keySourceTab === 'text'
                      ? 'bg-[#6338F9] text-white shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  از متن
                </button>
              </div>

              {/* پیام وضعیت استخراج */}
              {keyStatusMessage && (
                <div
                  className={`p-3 rounded-xl text-xs font-medium flex items-center gap-2 ${
                    keyStatusMessage.type === 'success'
                      ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                      : keyStatusMessage.type === 'error'
                      ? 'bg-rose-50 text-rose-800 border border-rose-200'
                      : 'bg-indigo-50 text-indigo-800 border border-indigo-200'
                  }`}
                >
                  {isExtractingKey ? (
                    <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                  ) : keyStatusMessage.type === 'success' ? (
                    <CheckCircle2 className="w-4 h-4 shrink-0" />
                  ) : (
                    <AlertCircle className="w-4 h-4 shrink-0" />
                  )}
                  <span>{keyStatusMessage.text}</span>
                </div>
              )}

              {/* محتوای هر تب */}
              {keySourceTab === 'file' && (
                <div className="border-2 border-dashed border-[#D5C8FF] bg-[#FAF8FF] rounded-2xl p-8 text-center space-y-4">
                  <input
                    ref={keyFileInputRef}
                    type="file"
                    accept=".pdf,application/pdf,image/*"
                    onChange={handleKeyFileUpload}
                    className="hidden"
                  />
                  <div className="w-14 h-14 rounded-2xl bg-[#EDE7FF] text-[#6338F9] flex items-center justify-center mx-auto">
                    <FileText className="w-7 h-7" />
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm font-bold text-slate-800">
                      فایل پاسخنامه (PDF یا تصویر) خود را انتخاب کنید
                    </p>
                    <p className="text-xs text-slate-500">
                      PDF با کیفیت بالا برای بهترین نتیجه در استخراج خودکار کلید سوالات
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={isExtractingKey}
                    onClick={() => keyFileInputRef.current?.click()}
                    className="px-6 py-2.5 rounded-xl bg-[#6338F9] hover:bg-[#5228E8] disabled:opacity-60 text-white text-xs font-bold shadow-xs transition-all cursor-pointer"
                  >
                    {isExtractingKey ? 'در حال استخراج با هوش مصنوعی...' : 'انتخاب فایل'}
                  </button>
                  <p className="text-[11px] text-slate-400">
                    پشتیبانی از PDF، JPG، PNG
                  </p>
                </div>
              )}

              {keySourceTab === 'image' && (
                <div className="border-2 border-dashed border-[#D5C8FF] bg-[#FAF8FF] rounded-2xl p-8 text-center space-y-4">
                  <input
                    ref={keyImageInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleKeyFileUpload}
                    className="hidden"
                  />
                  <div className="w-14 h-14 rounded-2xl bg-[#EDE7FF] text-[#6338F9] flex items-center justify-center mx-auto">
                    <FileText className="w-7 h-7" />
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm font-bold text-slate-800">
                      عکس کلید یا پاسخنامه تشریحی را بارگذاری کنید
                    </p>
                    <p className="text-xs text-slate-500">
                      هوش مصنوعی شماره هر سوال و گزینه صحیح آن را از روی عکس تشخیص می‌دهد
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={isExtractingKey}
                    onClick={() => keyImageInputRef.current?.click()}
                    className="px-6 py-2.5 rounded-xl bg-[#6338F9] hover:bg-[#5228E8] disabled:opacity-60 text-white text-xs font-bold shadow-xs transition-all cursor-pointer"
                  >
                    {isExtractingKey ? 'در حال خواندن تصویر...' : 'انتخاب تصویر پاسخنامه'}
                  </button>
                </div>
              )}

              {keySourceTab === 'text' && (
                <div className="space-y-3">
                  <label htmlFor="raw-key-textarea" className="block text-xs font-semibold text-slate-700">
                    متن پاسخنامه را تایپ یا جای‌گذاری (Paste) کنید:
                  </label>
                  <textarea
                    id="raw-key-textarea"
                    rows={4}
                    value={rawKeyText}
                    onChange={(e) => setRawKeyText(e.target.value)}
                    placeholder="مثال ۱: ۱-۳، ۲-۱، ۳-۴، ۴-۲&#10;مثال ۲: ۱: الف، ۲: ج، ۳: د&#10;یا متن کامل پاسخنامه تشریحی را کپی کنید..."
                    className="w-full p-3.5 rounded-xl border border-slate-200 bg-slate-50/50 focus:bg-white focus:border-[#6338F9] focus:outline-none text-xs text-slate-800 leading-relaxed"
                  />
                  <div className="flex items-center gap-2.5 flex-wrap">
                    <button
                      type="button"
                      onClick={() => handleExtractKeyFromText(false)}
                      className="px-4 py-2 rounded-xl bg-[#6338F9] hover:bg-[#5228E8] text-white text-xs font-semibold transition-all cursor-pointer"
                    >
                      ثبت سریع کلید از متن
                    </button>
                    <button
                      type="button"
                      disabled={isExtractingKey}
                      onClick={() => handleExtractKeyFromText(true)}
                      className="px-4 py-2 rounded-xl bg-[#F3EEFF] hover:bg-[#E5DCFF] text-[#6338F9] text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer"
                    >
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>استخراج هوشمند از متن تشریحی با AI</span>
                    </button>
                  </div>
                </div>
              )}

              {/* بارگذاری از پاسخنامه‌های ذخیره‌شده یا ویرایش دستی کلید */}
              <div className="pt-3 border-t border-slate-100 flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setShowManualKeyGrid((v) => !v)}
                    className="text-xs font-semibold text-[#6338F9] hover:underline cursor-pointer"
                  >
                    {showManualKeyGrid
                      ? 'بستن جدول ویرایش دستی کلید'
                      : `مشاهده و ورود دستی کلید (${toFarsiDigits(enteredKeysCount)} ثبت‌شده)`}
                  </button>
                </div>

                <div className="flex items-center gap-2">
                  {savedAnswerKeys.length > 0 && (
                    <select
                      aria-label="بارگذاری از پاسخنامه‌های ذخیره‌شده"
                      onChange={(e) => {
                        const found = savedAnswerKeys.find((k) => k.id === e.target.value);
                        if (found) {
                          setAnswerKey(found.answers);
                          setExplanations(found.explanations || {});
                          setQuestionCountStr(toFarsiDigits(found.questionCount));
                          setShowManualKeyGrid(true);
                        }
                      }}
                      defaultValue=""
                      className="text-xs px-2.5 py-1.5 rounded-lg border border-slate-200 bg-slate-50 text-slate-700"
                    >
                      <option value="" disabled>
                        انتخاب از پاسخنامه‌های ذخیره‌شده...
                      </option>
                      {savedAnswerKeys.map((k) => (
                        <option key={k.id} value={k.id}>
                          {k.title} ({toFarsiDigits(k.questionCount)} سوال)
                        </option>
                      ))}
                    </select>
                  )}

                  {enteredKeysCount > 0 && (
                    <button
                      type="button"
                      onClick={handleSaveCurrentKeyAsTemplate}
                      className="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-medium flex items-center gap-1 cursor-pointer"
                    >
                      <Save className="w-3.5 h-3.5" />
                      <span>ذخیره کلید</span>
                    </button>
                  )}
                </div>
              </div>

              {/* شبکه ورود و ویرایش کلید سوالات */}
              {showManualKeyGrid && (
                <div className="bg-slate-50 rounded-xl border border-slate-200/80 p-4 space-y-3 max-h-72 overflow-y-auto">
                  <div className="flex items-center justify-between text-xs text-slate-600">
                    <span className="font-bold">جدول کلید صحیح سوالات:</span>
                    <button
                      type="button"
                      onClick={() => setAnswerKey({})}
                      className="text-rose-600 hover:underline text-[11px] cursor-pointer"
                    >
                      پاک کردن همه کلیدها
                    </button>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2.5">
                    {Array.from({ length: questionCount }, (_, idx) => idx + 1).map((qNum) => {
                      const currentOpt = answerKey[qNum] ?? null;
                      return (
                        <div
                          key={qNum}
                          className="bg-white rounded-lg border border-slate-200 p-2 flex items-center justify-between gap-1"
                        >
                          <span className="text-xs font-bold text-slate-700 tabular-farsi w-6">
                            {toFarsiDigits(qNum)}.
                          </span>
                          <div className="flex items-center gap-1">
                            {([1, 2, 3, 4] as OptionChoice[]).map((opt) => {
                              const active = currentOpt === opt;
                              return (
                                <button
                                  key={opt}
                                  type="button"
                                  onClick={() =>
                                    setAnswerKey((prev) => {
                                      const next = { ...prev };
                                      if (next[qNum] === opt) delete next[qNum];
                                      else next[qNum] = opt;
                                      return next;
                                    })
                                  }
                                  className={`w-6 h-6 rounded-md text-[11px] font-bold tabular-farsi transition-colors cursor-pointer ${
                                    active
                                      ? 'bg-[#6338F9] text-white'
                                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                                  }`}
                                >
                                  {getOptionLabel(opt, optionLabelStyle)}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          ) : (
            /* بخش برش خودکار سوالات از PDF یا تصویر با بینایی ماشین */
            <div className="space-y-4">
              <div className="p-4 rounded-xl bg-[#F8F6FF] border border-[#E2D9FF] space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1">
                    <h3 className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                      <Scissors className="w-4 h-4 text-[#6338F9]" />
                      <span>برش خودکار هر سوال از فایل PDF یا تصویر دفترچه آزمون</span>
                    </h3>
                    <p className="text-xs text-slate-600 leading-relaxed">
                      فایل PDF یا عکس برگه سوالات خود را آپلود کنید تا سیستم بینایی ماشین، هر سوال را به صورت مجزا برش بزند و در باکس مخصوص کنار پاسخبرگ قرار دهد.
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2.5 flex-wrap">
                  <input
                    ref={slicerFileInputRef}
                    type="file"
                    accept=".pdf,application/pdf,image/*"
                    multiple
                    onChange={handleQuestionSlicerUpload}
                    className="hidden"
                  />
                  <button
                    type="button"
                    disabled={isSlicingQuestions}
                    onClick={() => slicerFileInputRef.current?.click()}
                    className="px-4 py-2.5 rounded-xl bg-[#6338F9] hover:bg-[#5228E8] disabled:opacity-60 text-white text-xs font-bold flex items-center gap-2 transition-all cursor-pointer"
                  >
                    <FolderOpen className="w-4 h-4" />
                    <span>آپلود PDF یا عکس سوالات برای برش خودکار</span>
                  </button>

                  <button
                    type="button"
                    disabled={isSlicingQuestions}
                    onClick={handleGenerateAndSliceSampleSheet}
                    className="px-3.5 py-2.5 rounded-xl bg-white hover:bg-slate-50 text-[#6338F9] border border-[#6338F9]/30 text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer"
                  >
                    <Wand2 className="w-4 h-4" />
                    <span>تست برش هوشمند با برگه نمونه ۵ سوالی</span>
                  </button>
                </div>
              </div>

              {slicerStatus && (
                <div
                  className={`p-3 rounded-xl text-xs font-medium flex items-center gap-2 ${
                    slicerStatus.type === 'success'
                      ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                      : slicerStatus.type === 'error'
                      ? 'bg-rose-50 text-rose-800 border border-rose-200'
                      : 'bg-indigo-50 text-indigo-800 border border-indigo-200'
                  }`}
                >
                  {isSlicingQuestions ? (
                    <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                  ) : slicerStatus.type === 'success' ? (
                    <CheckCircle2 className="w-4 h-4 shrink-0" />
                  ) : (
                    <AlertCircle className="w-4 h-4 shrink-0" />
                  )}
                  <span>{slicerStatus.text}</span>
                </div>
              )}

              {/* نمایش باکس‌های برش‌خورده و امکان تنظیم دقیق کادر هر سوال */}
              {detectedBoxes.length > 0 && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-800">
                      پیش‌نمایش سوالات برش‌خورده ({toFarsiDigits(detectedBoxes.length)} سوال):
                    </span>
                    <button
                      type="button"
                      onClick={handleAddManualCropBox}
                      className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-medium flex items-center gap-1 cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>افزودن باکس سوال جدید</span>
                    </button>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
                    {/* لیست کارت‌های سوالات برش‌خورده */}
                    <div className="md:col-span-7 space-y-2.5 max-h-80 overflow-y-auto pl-1">
                      {detectedBoxes.map((box) => {
                        const isSelected = box.id === selectedBoxId;
                        return (
                          <div
                            key={box.id}
                            onClick={() => setSelectedBoxId(box.id)}
                            className={`p-3 rounded-xl border transition-all cursor-pointer ${
                              isSelected
                                ? 'border-[#6338F9] bg-[#F9F7FF]'
                                : 'border-slate-200 bg-white hover:border-slate-300'
                            }`}
                          >
                            <div className="flex items-center justify-between mb-2">
                              <span className="text-xs font-bold text-[#6338F9] tabular-farsi">
                                باکس سوال {toFarsiDigits(box.questionNumber)} (صفحه{' '}
                                {toFarsiDigits(box.pageIndex + 1)})
                              </span>
                              <button
                                type="button"
                                onClick={(ev) => {
                                  ev.stopPropagation();
                                  handleDeleteCropBox(box.id);
                                }}
                                aria-label={`حذف باکس سوال ${toFarsiDigits(box.questionNumber)}`}
                                className="p-1 text-slate-400 hover:text-rose-600 rounded"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                            {box.croppedDataUrl && (
                              <img
                                src={box.croppedDataUrl}
                                alt={`برش سوال ${toFarsiDigits(box.questionNumber)}`}
                                referrerPolicy="no-referrer"
                                className="w-full rounded-lg border border-slate-200 object-contain max-h-36 bg-white"
                              />
                            )}
                          </div>
                        );
                      })}
                    </div>

                    {/* کنترلر تنظیم کادر برش سوال انتخاب‌شده */}
                    <div className="md:col-span-5 bg-slate-50 rounded-xl border border-slate-200 p-3.5 space-y-3">
                      {(() => {
                        const activeBox =
                          detectedBoxes.find((b) => b.id === selectedBoxId) || detectedBoxes[0];
                        if (!activeBox) return null;
                        return (
                          <>
                            <div className="flex items-center justify-between gap-2 border-b border-slate-200 pb-2">
                              <span className="text-xs font-bold text-slate-800">
                                تنظیم کادر سوال {toFarsiDigits(activeBox.questionNumber)}
                              </span>
                              <div className="flex items-center gap-1.5">
                                <label
                                  htmlFor="box-qnum-input"
                                  className="text-[11px] text-slate-500"
                                >
                                  شماره:
                                </label>
                                <input
                                  id="box-qnum-input"
                                  type="number"
                                  min={1}
                                  max={500}
                                  value={activeBox.questionNumber}
                                  onChange={(e) =>
                                    handleUpdateBoxQuestionNumber(
                                      activeBox.id,
                                      Number(e.target.value) || 1
                                    )
                                  }
                                  className="w-14 px-2 py-1 rounded-lg border border-slate-200 bg-white text-xs font-bold text-center"
                                />
                              </div>
                            </div>

                            <div className="space-y-1.5">
                              <label className="block text-[11px] text-slate-600">
                                مرز بالای سوال: {toFarsiDigits(activeBox.ymin)}
                              </label>
                              <input
                                type="range"
                                min={0}
                                max={950}
                                value={activeBox.ymin}
                                onChange={(e) =>
                                  handleUpdateBoxBounds(
                                    activeBox.id,
                                    'ymin',
                                    Number(e.target.value)
                                  )
                                }
                                className="w-full accent-[#6338F9]"
                              />
                            </div>

                            <div className="space-y-1.5">
                              <label className="block text-[11px] text-slate-600">
                                مرز پایین سوال: {toFarsiDigits(activeBox.ymax)}
                              </label>
                              <input
                                type="range"
                                min={50}
                                max={1000}
                                value={activeBox.ymax}
                                onChange={(e) =>
                                  handleUpdateBoxBounds(
                                    activeBox.id,
                                    'ymax',
                                    Number(e.target.value)
                                  )
                                }
                                className="w-full accent-[#6338F9]"
                              />
                            </div>

                            <div className="space-y-1.5">
                              <label className="block text-[11px] text-slate-600">
                                مرز چپ سوال (ستون چپ/راست): {toFarsiDigits(activeBox.xmin)}
                              </label>
                              <input
                                type="range"
                                min={0}
                                max={950}
                                value={activeBox.xmin}
                                onChange={(e) =>
                                  handleUpdateBoxBounds(
                                    activeBox.id,
                                    'xmin',
                                    Number(e.target.value)
                                  )
                                }
                                className="w-full accent-[#6338F9]"
                              />
                            </div>

                            <div className="space-y-1.5">
                              <label className="block text-[11px] text-slate-600">
                                مرز راست سوال: {toFarsiDigits(activeBox.xmax)}
                              </label>
                              <input
                                type="range"
                                min={50}
                                max={1000}
                                value={activeBox.xmax}
                                onChange={(e) =>
                                  handleUpdateBoxBounds(
                                    activeBox.id,
                                    'xmax',
                                    Number(e.target.value)
                                  )
                                }
                                className="w-full accent-[#6338F9]"
                              />
                            </div>

                            <p className="text-[11px] text-slate-500 leading-relaxed">
                              با تغییر اسلایدرهای بالا و پایین، تصویر برش‌خورده سوال{' '}
                              {toFarsiDigits(activeBox.questionNumber)} در لحظه به‌روزرسانی می‌شود.
                            </p>
                          </>
                        );
                      })()}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

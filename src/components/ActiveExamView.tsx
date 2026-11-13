import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Clock,
  Bookmark,
  ArrowRight,
  ArrowLeft,
  LogOut,
  BarChart2,
  Pause,
  Play,
  ZoomIn,
  ZoomOut,
  ImagePlus,
  LayoutGrid,
  List,
  Keyboard,
} from 'lucide-react';
import {
  ExamSession,
  OptionChoice,
  QuestionMarker,
} from '../types/exam';
import {
  toFarsiDigits,
  formatFarsiTimer,
  getOptionLabel,
} from '../utils/farsi';
import { saveSingleQuestionImageToIDB } from '../utils/imageStorage';

interface ActiveExamViewProps {
  exam: ExamSession;
  optionLabelStyle: 'numeric' | 'alphabetic';
  onUpdateExam: (updated: ExamSession) => void;
  onFinishExam: (finalExam: ExamSession) => void;
  onExitWithoutFinishing: () => void;
}

export const ActiveExamView: React.FC<ActiveExamViewProps> = ({
  exam,
  optionLabelStyle,
  onUpdateExam,
  onFinishExam,
  onExitWithoutFinishing,
}) => {
  const [currentIndex, setCurrentIndex] = useState<number>(0);
  const [isPaused, setIsPaused] = useState<boolean>(false);
  const [sheetFilter, setSheetFilter] = useState<'all' | QuestionMarker | 'unanswered'>('all');
  const [sheetViewMode, setSheetViewMode] = useState<'rows' | 'bubbles'>('rows');
  const [mobilePane, setMobilePane] = useState<'question' | 'sheet'>('question');
  const [imageZoom, setImageZoom] = useState<number>(100);
  const singleQuestionImageRef = useRef<HTMLInputElement>(null);

  const examRef = useRef<ExamSession>(exam);
  examRef.current = exam;

  const currentQuestion = exam.questions[currentIndex] || exam.questions[0];
  if (!currentQuestion) {
    return null;
  }
  const totalSecondsAllowed = exam.durationMinutes * 60;
  const remainingSeconds = Math.max(0, totalSecondsAllowed - exam.elapsedSeconds);

  // تایمر ثانیه‌شمار آزمون و زمان‌سنج اختصاصی هر سوال
  useEffect(() => {
    if (isPaused || exam.status === 'completed') return;

    const timer = window.setInterval(() => {
      const latest = examRef.current;
      const nextElapsed = latest.elapsedSeconds + 1;
      const updatedQuestions = latest.questions.map((q, idx) =>
        idx === currentIndex
          ? { ...q, timeSpentSeconds: q.timeSpentSeconds + 1 }
          : q
      );

      onUpdateExam({
        ...latest,
        elapsedSeconds: nextElapsed,
        questions: updatedQuestions,
      });
    }, 1000);

    return () => window.clearInterval(timer);
  }, [isPaused, currentIndex, exam.status, onUpdateExam]);

  // انتخاب یا پاک کردن گزینه یک سوال
  const handleSelectOption = useCallback(
    (qIndex: number, option: OptionChoice) => {
      const latest = examRef.current;
      const updatedQuestions = latest.questions.map((q, idx) => {
        if (idx !== qIndex) return q;
        return {
          ...q,
          selectedOption: q.selectedOption === option ? null : option,
        };
      });
      onUpdateExam({
        ...latest,
        questions: updatedQuestions,
      });
    },
    [onUpdateExam]
  );

  // تغییر نشانگر مدیریت آزمون (○ زمان‌دار/سخت زرد، − شک‌دار آبی، × نخونده/حذفی قرمز)
  const handleToggleMarker = useCallback(
    (qIndex: number, marker: QuestionMarker) => {
      const latest = examRef.current;
      const updatedQuestions = latest.questions.map((q, idx) => {
        if (idx !== qIndex) return q;
        return {
          ...q,
          marker: q.marker === marker ? 'none' : marker,
        };
      });
      onUpdateExam({
        ...latest,
        questions: updatedQuestions,
      });
    },
    [onUpdateExam]
  );

  // میانبرهای کیبورد برای لپ‌تاپ و تبلت ویندوزی
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT')
      ) {
        return;
      }

      if (e.key === '1' || e.key === '۱') {
        e.preventDefault();
        handleSelectOption(currentIndex, 1);
      } else if (e.key === '2' || e.key === '۲') {
        e.preventDefault();
        handleSelectOption(currentIndex, 2);
      } else if (e.key === '3' || e.key === '۳') {
        e.preventDefault();
        handleSelectOption(currentIndex, 3);
      } else if (e.key === '4' || e.key === '۴') {
        e.preventDefault();
        handleSelectOption(currentIndex, 4);
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        setCurrentIndex((i) => Math.max(0, i - 1));
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        setCurrentIndex((i) => Math.min(examRef.current.questions.length - 1, i + 1));
      } else if (e.key.toLowerCase() === 'o' || e.key === 'خ') {
        e.preventDefault();
        handleToggleMarker(currentIndex, 'circle');
      } else if (e.key.toLowerCase() === 'm' || e.key === '-' || e.key === 'پ') {
        e.preventDefault();
        handleToggleMarker(currentIndex, 'minus');
      } else if (e.key.toLowerCase() === 'x' || e.key === 'ط') {
        e.preventDefault();
        handleToggleMarker(currentIndex, 'cross');
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentIndex, handleSelectOption, handleToggleMarker]);

  const handleToggleBookmark = (qIndex: number) => {
    const updatedQuestions = exam.questions.map((q, idx) =>
      idx === qIndex ? { ...q, bookmarked: !q.bookmarked } : q
    );
    onUpdateExam({
      ...exam,
      questions: updatedQuestions,
    });
  };

  const handleUpdateNote = (qIndex: number, noteText: string) => {
    const updatedQuestions = exam.questions.map((q, idx) =>
      idx === qIndex ? { ...q, note: noteText } : q
    );
    onUpdateExam({
      ...exam,
      questions: updatedQuestions,
    });
  };

  const handleUploadSingleQuestionImage = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      const targetQ = exam.questions[currentIndex];
      if (targetQ) {
        void saveSingleQuestionImageToIDB(exam.id, targetQ.questionNumber, dataUrl);
      }
      const updatedQuestions = exam.questions.map((q, idx) =>
        idx === currentIndex ? { ...q, croppedImageUrl: dataUrl } : q
      );
      onUpdateExam({
        ...exam,
        questions: updatedQuestions,
      });
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const answeredCount = exam.questions.filter((q) => q.selectedOption !== null).length;
  const circleCount = exam.questions.filter((q) => q.marker === 'circle').length;
  const minusCount = exam.questions.filter((q) => q.marker === 'minus').length;
  const crossCount = exam.questions.filter((q) => q.marker === 'cross').length;

  // استایل دور باکس بر اساس نشانگر انتخاب‌شده (دایره=زرد، منها=آبی، ضربدر=قرمز)
  const getMarkerRowStyle = (marker: QuestionMarker, isCurrent: boolean) => {
    if (marker === 'circle') {
      return 'border-2 border-amber-400 bg-amber-50/80 shadow-xs ring-2 ring-amber-300/40';
    }
    if (marker === 'minus') {
      return 'border-2 border-sky-400 bg-sky-50/80 shadow-xs ring-2 ring-sky-300/40';
    }
    if (marker === 'cross') {
      return 'border-2 border-rose-400 bg-rose-50/80 shadow-xs ring-2 ring-rose-300/40';
    }
    if (isCurrent) {
      return 'border-2 border-[#6338F9]/60 bg-[#F8F6FF]';
    }
    return 'border border-transparent hover:bg-slate-50';
  };

  const getQuestionBoxBorderStyle = (marker: QuestionMarker) => {
    if (marker === 'circle') {
      return 'border-2 border-amber-400 ring-4 ring-amber-200/40';
    }
    if (marker === 'minus') {
      return 'border-2 border-sky-400 ring-4 ring-sky-200/40';
    }
    if (marker === 'cross') {
      return 'border-2 border-rose-400 ring-4 ring-rose-200/40';
    }
    return 'border border-indigo-100/80';
  };

  const filteredQuestionsWithIndex = exam.questions
    .map((q, idx) => ({ q, idx }))
    .filter(({ q }) => {
      if (sheetFilter === 'all') return true;
      if (sheetFilter === 'unanswered') return q.selectedOption === null;
      return q.marker === sheetFilter;
    });

  return (
    <div className="min-h-screen bg-[#F6F7FB] flex flex-col">
      {/* ۱. هدر بالای صفحه آزمون دقیقاً منطبق با تصویر مرجع ۱ */}
      <header className="bg-white border-b border-indigo-100/80 px-4 md:px-8 py-3 flex items-center justify-between gap-3 sticky top-0 z-30">
        <button
          type="button"
          onClick={onExitWithoutFinishing}
          className="flex items-center gap-2.5 text-right cursor-pointer shrink-0"
          title="بازگشت به داشبورد (آزمون ذخیره می‌ماند)"
        >
          <img
            src={`${import.meta.env.BASE_URL}icon.svg`}
            alt="آیکون پاسخبرگ"
            referrerPolicy="no-referrer"
            className="w-8 h-8 md:w-9 md:h-9 rounded-xl shadow-xs"
          />
          <span className="text-lg md:text-2xl font-display-farsi text-slate-900">
            پاسخبرگ
          </span>
        </button>

        <div className="text-center truncate px-2">
          <h1 className="text-xs sm:text-sm md:text-lg font-bold text-slate-900 truncate">
            {exam.title}
            {exam.topic ? ` – ${exam.topic}` : ''}
          </h1>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setIsPaused((p) => !p)}
            className="min-h-[38px] px-3 py-1.5 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            {isPaused ? (
              <Play className="w-3.5 h-3.5 text-emerald-600" />
            ) : (
              <Pause className="w-3.5 h-3.5" />
            )}
            <span className="hidden sm:inline">{isPaused ? 'ادامه زمان' : 'توقف زمان'}</span>
          </button>

          {/* زمان باقی‌مانده چسبان همیشه در دسترس در هدر آزمون */}
          <div
            className={`px-3 py-1.5 rounded-xl border flex items-center gap-1.5 tabular-farsi ${
              remainingSeconds < 60
                ? 'bg-rose-50 border-rose-300 text-rose-600 animate-pulse font-extrabold text-sm'
                : 'bg-[#F3EEFF] border-[#6338F9]/30 text-[#6338F9] font-bold text-xs sm:text-sm'
            }`}
          >
            <Clock className="w-3.5 h-3.5" />
            <span>باقی‌مانده: {formatFarsiTimer(remainingSeconds)}</span>
          </div>

          <button
            type="button"
            onClick={() => onFinishExam(exam)}
            className="min-h-[38px] px-3.5 md:px-4 py-1.5 rounded-xl border border-rose-300 bg-rose-50 hover:bg-rose-600 text-rose-600 hover:text-white text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer"
          >
            <LogOut className="w-4 h-4" />
            <span>پایان آزمون</span>
          </button>
        </div>
      </header>

      {/* ۲. نوار ۴ ستونه وضعیت زمان و پاسخگویی منطبق با تصویر مرجع ۱ */}
      <div className="max-w-[1400px] w-full mx-auto px-3 md:px-6 pt-3 md:pt-5">
        <div className="bg-white rounded-2xl border border-indigo-100/80 px-3 py-3 md:px-4 md:py-4 grid grid-cols-2 md:grid-cols-4 divide-y md:divide-y-0 md:divide-x md:divide-x-reverse divide-slate-100 shadow-2xs">
          <div className="flex items-center justify-center gap-2.5 py-1.5 md:py-0">
            <div className="w-9 h-9 md:w-10 md:h-10 rounded-full bg-[#F3EEFF] text-[#6338F9] flex items-center justify-center shrink-0">
              <Clock className="w-4 h-4 md:w-5 md:h-5" />
            </div>
            <div className="text-right">
              <div className="text-[11px] md:text-xs text-slate-500">زمان باقی‌مانده</div>
              <div
                className={`text-lg md:text-2xl font-extrabold tabular-farsi ${
                  remainingSeconds < 60 ? 'text-rose-600 animate-pulse' : 'text-[#6338F9]'
                }`}
              >
                {formatFarsiTimer(remainingSeconds)}
              </div>
            </div>
          </div>

          <div className="flex flex-col items-center justify-center py-1.5 md:py-0">
            <span className="text-[11px] md:text-xs text-slate-500">زمان سپری شده</span>
            <span className="text-base md:text-xl font-bold text-slate-800 tabular-farsi mt-0.5">
              {formatFarsiTimer(exam.elapsedSeconds)}
            </span>
          </div>

          <div className="flex flex-col items-center justify-center py-1.5 md:py-0">
            <span className="text-[11px] md:text-xs text-slate-500">تعداد سوالات</span>
            <span className="text-base md:text-xl font-bold text-slate-800 tabular-farsi mt-0.5">
              {toFarsiDigits(exam.questionCount)}
            </span>
          </div>

          <div className="flex flex-col items-center justify-center py-1.5 md:py-0">
            <span className="text-[11px] md:text-xs text-slate-500">وضعیت پاسخگویی</span>
            <span className="text-xs sm:text-sm md:text-base font-bold text-slate-800 tabular-farsi mt-1">
              {toFarsiDigits(answeredCount)} از {toFarsiDigits(exam.questionCount)} پاسخ داده شده
            </span>
          </div>
        </div>

        {/* سوییچر سریع مخصوص گوشی موبایل برای جابه‌جایی بدون اسکرول طولانی بین باکس سوال و کل پاسخبرگ */}
        <div className="md:hidden mt-3 grid grid-cols-2 gap-1.5 p-1 bg-white rounded-xl border border-indigo-100">
          <button
            type="button"
            onClick={() => setMobilePane('question')}
            className={`min-h-[40px] rounded-lg text-xs font-bold transition-colors cursor-pointer ${
              mobilePane === 'question'
                ? 'bg-[#6338F9] text-white'
                : 'text-slate-600'
            }`}
          >
            باکس سوال ({toFarsiDigits(currentQuestion.questionNumber)} از{' '}
            {toFarsiDigits(exam.questionCount)})
          </button>
          <button
            type="button"
            onClick={() => setMobilePane('sheet')}
            className={`min-h-[40px] rounded-lg text-xs font-bold transition-colors cursor-pointer ${
              mobilePane === 'sheet'
                ? 'bg-[#6338F9] text-white'
                : 'text-slate-600'
            }`}
          >
            پاسخبرگ کامل ({toFarsiDigits(answeredCount)}/{toFarsiDigits(exam.questionCount)})
          </button>
        </div>
      </div>

      {/* ۳. بخش اصلی دو ستونی در تبلت ویندوزی (md) و لپ‌تاپ (lg) */}
      <main className="max-w-[1400px] w-full mx-auto px-3 md:px-6 py-4 md:py-5 flex-1 grid grid-cols-1 md:grid-cols-12 gap-5 items-start">
        {/* ستون راست: باکس سوال */}
        <section
          className={`md:col-span-7 lg:col-span-8 bg-white rounded-2xl p-4 sm:p-6 transition-all flex flex-col justify-between min-h-[540px] ${
            mobilePane === 'sheet' ? 'hidden md:flex' : 'flex'
          } ${getQuestionBoxBorderStyle(currentQuestion.marker)}`}
        >
          <div>
            {/* هدر باکس سوال: شماره سوال + دکمه‌های تکنیک دایره (زرد)، منها (آبی)، ضربدر (قرمز) */}
            <div className="flex flex-wrap items-center justify-between gap-2.5 pb-4 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <span className="px-3.5 py-1.5 rounded-xl bg-slate-100 text-slate-800 text-xs font-bold tabular-farsi">
                  سوال {toFarsiDigits(currentQuestion.questionNumber)} از{' '}
                  {toFarsiDigits(exam.questionCount)}
                </span>

                <button
                  type="button"
                  onClick={() => handleToggleBookmark(currentIndex)}
                  aria-label="نشان کردن سوال برای مرور"
                  className={`min-h-[38px] min-w-[38px] flex items-center justify-center rounded-xl border transition-colors cursor-pointer ${
                    currentQuestion.bookmarked
                      ? 'bg-[#F3EEFF] border-[#6338F9] text-[#6338F9]'
                      : 'border-slate-200 text-slate-400 hover:text-slate-700'
                  }`}
                >
                  <Bookmark className="w-4 h-4" />
                </button>

                <span className="text-[11px] text-slate-400 tabular-farsi hidden sm:inline">
                  زمان سوال: {formatFarsiTimer(currentQuestion.timeSpentSeconds)}
                </span>
              </div>

              {/* دکمه‌های ۳ گانه مدیریت سوالات با ابعاد مناسب لمس تبلت و موبایل */}
              <div className="flex items-center gap-1.5 flex-wrap">
                <button
                  type="button"
                  onClick={() => handleToggleMarker(currentIndex, 'circle')}
                  className={`min-h-[38px] px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 border transition-all cursor-pointer ${
                    currentQuestion.marker === 'circle'
                      ? 'bg-amber-400 text-slate-950 border-amber-500 shadow-xs'
                      : 'bg-amber-50/70 text-amber-800 border-amber-200 hover:bg-amber-100'
                  }`}
                >
                  <span className="text-sm leading-none font-extrabold">○</span>
                  <span>سخت / زمان‌دار</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleToggleMarker(currentIndex, 'minus')}
                  className={`min-h-[38px] px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 border transition-all cursor-pointer ${
                    currentQuestion.marker === 'minus'
                      ? 'bg-sky-500 text-white border-sky-600 shadow-xs'
                      : 'bg-sky-50/70 text-sky-800 border-sky-200 hover:bg-sky-100'
                  }`}
                >
                  <span className="text-sm leading-none font-extrabold">−</span>
                  <span>شک‌دار</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleToggleMarker(currentIndex, 'cross')}
                  className={`min-h-[38px] px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 border transition-all cursor-pointer ${
                    currentQuestion.marker === 'cross'
                      ? 'bg-rose-500 text-white border-rose-600 shadow-xs'
                      : 'bg-rose-50/70 text-rose-800 border-rose-200 hover:bg-rose-100'
                  }`}
                >
                  <span className="text-sm leading-none font-extrabold">×</span>
                  <span>نخونده / حذفی</span>
                </button>
              </div>
            </div>

            {/* بدنه سوال */}
            <div className="py-5 space-y-5">
              {currentQuestion.croppedImageUrl ? (
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-500">
                      تصویر برش‌خورده سوال {toFarsiDigits(currentQuestion.questionNumber)}:
                    </span>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => setImageZoom((z) => Math.max(50, z - 20))}
                        aria-label="کوچک‌نمایی تصویر سوال"
                        className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 cursor-pointer"
                      >
                        <ZoomOut className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setImageZoom(100)}
                        title="بازنشانی اندازه تصویر به ۱۰۰٪"
                        className="text-xs font-bold text-slate-600 hover:text-[#6338F9] tabular-farsi px-1.5 py-0.5 rounded cursor-pointer"
                      >
                        {toFarsiDigits(imageZoom)}٪
                      </button>
                      <button
                        type="button"
                        onClick={() => setImageZoom((z) => Math.min(250, z + 20))}
                        aria-label="بزرگ‌نمایی تصویر سوال"
                        className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 cursor-pointer"
                      >
                        <ZoomIn className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  <div className="bg-slate-50/70 rounded-2xl border border-slate-200/80 p-3 md:p-4 flex items-center justify-center overflow-auto max-h-[360px] select-none">
                    <img
                      src={currentQuestion.croppedImageUrl}
                      alt={`سوال ${toFarsiDigits(currentQuestion.questionNumber)}`}
                      referrerPolicy="no-referrer"
                      style={{
                        transform: `scale(${imageZoom / 100})`,
                        transformOrigin: 'top center',
                      }}
                      className="rounded-xl object-contain transition-transform duration-150 max-w-full"
                    />
                  </div>
                </div>
              ) : (
                <div className="bg-[#FAF9FF] rounded-2xl border border-indigo-100/70 p-4 space-y-3">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <span className="text-xs sm:text-sm font-bold text-slate-800">
                      سوال شماره {toFarsiDigits(currentQuestion.questionNumber)}
                    </span>
                    <div>
                      <input
                        ref={singleQuestionImageRef}
                        type="file"
                        accept="image/*"
                        onChange={handleUploadSingleQuestionImage}
                        className="hidden"
                      />
                      <button
                        type="button"
                        onClick={() => singleQuestionImageRef.current?.click()}
                        className="min-h-[36px] px-3 py-1.5 rounded-lg bg-white border border-indigo-200 text-[#6338F9] hover:bg-[#F3EEFF] text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
                      >
                        <ImagePlus className="w-3.5 h-3.5" />
                        <span>افزودن تصویر برای این سوال</span>
                      </button>
                    </div>
                  </div>
                  <textarea
                    rows={2}
                    value={currentQuestion.note || ''}
                    onChange={(e) => handleUpdateNote(currentIndex, e.target.value)}
                    placeholder="چک‌نویس یا راه‌حل سوال را در صورت تمایل اینجا بنویسید..."
                    className="w-full p-3 rounded-xl bg-white border border-slate-200 focus:border-[#6338F9] focus:outline-none text-xs text-slate-700 leading-relaxed"
                  />
                </div>
              )}

              {/* ۴ کارت گزینه بزرگ با ابعاد لمسی استاندارد (حداقل ۵۲ پیکسل ارتفاع) */}
              <div className="space-y-2.5">
                {([1, 2, 3, 4] as OptionChoice[]).map((opt) => {
                  const isSelected = currentQuestion.selectedOption === opt;
                  return (
                    <button
                      key={opt}
                      type="button"
                      onClick={() => handleSelectOption(currentIndex, opt)}
                      className={`w-full min-h-[54px] p-3.5 rounded-2xl border text-right flex items-center justify-between transition-all cursor-pointer ${
                        isSelected
                          ? 'bg-[#F3EEFF] border-[#6338F9] ring-2 ring-[#6338F9]/20'
                          : 'bg-white border-slate-200 hover:border-[#6338F9]/40 hover:bg-slate-50/60'
                      }`}
                    >
                      <div className="flex items-center gap-3.5">
                        <span
                          className={`w-9 h-9 rounded-xl flex items-center justify-center text-sm font-bold tabular-farsi border transition-colors ${
                            isSelected
                              ? 'bg-[#6338F9] text-white border-[#6338F9]'
                              : 'bg-slate-50 text-slate-700 border-slate-200'
                          }`}
                        >
                          {getOptionLabel(opt, optionLabelStyle)}
                        </span>
                        <span
                          className={`text-sm font-semibold ${
                            isSelected ? 'text-[#6338F9]' : 'text-slate-700'
                          }`}
                        >
                          گزینه {getOptionLabel(opt, optionLabelStyle)}
                        </span>
                      </div>

                      <div
                        className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                          isSelected ? 'border-[#6338F9]' : 'border-slate-300'
                        }`}
                      >
                        {isSelected && (
                          <span className="w-2.5 h-2.5 rounded-full bg-[#6338F9]" />
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* فوتر باکس سوال: دکمه‌های سوال بعدی و سوال قبلی + راهنمای کلیدهای میانبر */}
          <div className="pt-4 border-t border-slate-100 space-y-3">
            <div className="flex items-center justify-between">
              <button
                type="button"
                disabled={currentIndex >= exam.questions.length - 1}
                onClick={() =>
                  setCurrentIndex((i) => Math.min(exam.questions.length - 1, i + 1))
                }
                className="min-h-[44px] px-5 py-2.5 rounded-xl border border-indigo-200 bg-[#F9F7FF] hover:bg-[#6338F9] text-[#6338F9] hover:text-white disabled:opacity-40 text-xs font-bold flex items-center gap-2 transition-all cursor-pointer"
              >
                <ArrowRight className="w-4 h-4" />
                <span>سوال بعدی</span>
              </button>

              <label className="flex items-center gap-2 text-xs text-slate-600 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={currentQuestion.bookmarked}
                  onChange={() => handleToggleBookmark(currentIndex)}
                  className="rounded accent-[#6338F9] w-4 h-4"
                />
                <span>علامت‌گذاری مرور</span>
              </label>

              <button
                type="button"
                disabled={currentIndex <= 0}
                onClick={() => setCurrentIndex((i) => Math.max(0, i - 1))}
                className="min-h-[44px] px-5 py-2.5 rounded-xl border border-indigo-200 bg-[#F9F7FF] hover:bg-[#6338F9] text-[#6338F9] hover:text-white disabled:opacity-40 text-xs font-bold flex items-center gap-2 transition-all cursor-pointer"
              >
                <span>سوال قبلی</span>
                <ArrowLeft className="w-4 h-4" />
              </button>
            </div>

            <div className="hidden lg:flex items-center justify-center gap-4 text-[11px] text-slate-400 pt-1">
              <span className="flex items-center gap-1">
                <Keyboard className="w-3.5 h-3.5" />
                <span>میانبر کیبورد: کلیدهای ۱ تا ۴ (گزینه‌ها)</span>
              </span>
              <span>·</span>
              <span>فلش راست/چپ (جابه‌جایی سوال)</span>
              <span>·</span>
              <span>O (○ سخت) · M (− شک‌دار) · X (× حذفی)</span>
            </div>
          </div>
        </section>

        {/* ستون چپ: پاسخبرگ */}
        <aside
          className={`md:col-span-5 lg:col-span-4 bg-white rounded-2xl border border-indigo-100/80 p-4 sm:p-5 flex flex-col justify-between md:sticky md:top-18 md:max-h-[calc(100vh-5.5rem)] md:overflow-y-auto ${
            mobilePane === 'question' ? 'hidden md:flex' : 'flex'
          }`}
        >
          <div>
            {/* هدر پاسخبرگ */}
            <div className="flex items-center justify-between pb-3.5 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <img
                  src={`${import.meta.env.BASE_URL}icon.svg`}
                  alt=""
                  referrerPolicy="no-referrer"
                  className="w-5 h-5 rounded-md"
                />
                <h2 className="text-base font-bold text-slate-900">پاسخبرگ</h2>
              </div>

              <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg">
                <button
                  type="button"
                  onClick={() => setSheetViewMode('rows')}
                  title="نمای ردیفی استاندارد"
                  className={`p-1.5 rounded-md text-xs cursor-pointer ${
                    sheetViewMode === 'rows'
                      ? 'bg-white text-[#6338F9] shadow-2xs'
                      : 'text-slate-500'
                  }`}
                >
                  <List className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => setSheetViewMode('bubbles')}
                  title="نمای حبابی فشرده"
                  className={`p-1.5 rounded-md text-xs cursor-pointer ${
                    sheetViewMode === 'bubbles'
                      ? 'bg-white text-[#6338F9] shadow-2xs'
                      : 'text-slate-500'
                  }`}
                >
                  <LayoutGrid className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* راهنمای ستون‌ها در نمای ردیفی: سوال | ۱ ۲ ۳ ۴ | نشانگرها */}
            {sheetViewMode === 'rows' && (
              <div className="px-2.5 pt-2 pb-1 flex items-center justify-between text-[11px] font-bold text-slate-400 select-none">
                <span className="w-7 text-right">سوال</span>
                <div className="flex items-center gap-1.5">
                  <span className="w-8 sm:w-9 text-center">۱</span>
                  <span className="w-8 sm:w-9 text-center">۲</span>
                  <span className="w-8 sm:w-9 text-center">۳</span>
                  <span className="w-8 sm:w-9 text-center">۴</span>
                </div>
                <div className="w-22 text-left pl-1">علامت</div>
              </div>
            )}

            {/* نوار فیلتر سریع بر اساس نشانگرها */}
            <div className="flex items-center gap-1.5 flex-wrap py-3 border-b border-slate-100">
              <button
                type="button"
                onClick={() => setSheetFilter('all')}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-colors cursor-pointer ${
                  sheetFilter === 'all'
                    ? 'bg-[#6338F9] text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                همه ({toFarsiDigits(exam.questionCount)})
              </button>
              <button
                type="button"
                onClick={() => setSheetFilter('circle')}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-colors cursor-pointer ${
                  sheetFilter === 'circle'
                    ? 'bg-amber-400 text-slate-950'
                    : 'bg-amber-50 text-amber-800 border border-amber-200'
                }`}
              >
                ○ سخت ({toFarsiDigits(circleCount)})
              </button>
              <button
                type="button"
                onClick={() => setSheetFilter('minus')}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-colors cursor-pointer ${
                  sheetFilter === 'minus'
                    ? 'bg-sky-500 text-white'
                    : 'bg-sky-50 text-sky-800 border border-sky-200'
                }`}
              >
                − شک‌دار ({toFarsiDigits(minusCount)})
              </button>
              <button
                type="button"
                onClick={() => setSheetFilter('cross')}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-colors cursor-pointer ${
                  sheetFilter === 'cross'
                    ? 'bg-rose-500 text-white'
                    : 'bg-rose-50 text-rose-800 border border-rose-200'
                }`}
              >
                × حذفی ({toFarsiDigits(crossCount)})
              </button>
            </div>

            {/* لیست سوالات پاسخبرگ با ابعاد مناسب لمس انگشت و قلم تبلت */}
            {sheetViewMode === 'rows' ? (
              <div className="space-y-2 py-3 max-h-[440px] overflow-y-auto pl-1">
                {filteredQuestionsWithIndex.map(({ q, idx }) => {
                  const isCurrent = idx === currentIndex;
                  return (
                    <div
                      key={q.questionNumber}
                      className={`px-2.5 py-2 rounded-xl transition-all flex items-center justify-between gap-1.5 ${getMarkerRowStyle(
                        q.marker,
                        isCurrent
                      )}`}
                    >
                      {/* شماره سوال در سمت راست */}
                      <button
                        type="button"
                        onClick={() => {
                          setCurrentIndex(idx);
                          setMobilePane('question');
                        }}
                        className="w-7 text-right font-bold text-xs text-slate-800 tabular-farsi cursor-pointer shrink-0"
                      >
                        {toFarsiDigits(q.questionNumber)}
                      </button>

                      {/* گزینه‌های ۱ تا ۴ از راست به چپ: ۱، ۲، ۳، ۴ */}
                      <div className="flex items-center gap-1.5">
                        {([1, 2, 3, 4] as OptionChoice[]).map((opt) => {
                          const isSelected = q.selectedOption === opt;
                          return (
                            <button
                              key={opt}
                              type="button"
                              onClick={() => {
                                setCurrentIndex(idx);
                                handleSelectOption(idx, opt);
                              }}
                              aria-label={`سوال ${toFarsiDigits(q.questionNumber)} گزینه ${toFarsiDigits(opt)}`}
                              className={`w-8 h-8 sm:w-9 sm:h-9 rounded-lg text-xs font-bold tabular-farsi border transition-all cursor-pointer ${
                                isSelected
                                  ? 'bg-[#F3EEFF] border-2 border-[#6338F9] text-[#6338F9] shadow-2xs'
                                  : 'bg-white border-slate-200 text-slate-700 hover:border-slate-300'
                              }`}
                            >
                              {getOptionLabel(opt, optionLabelStyle)}
                            </button>
                          );
                        })}
                      </div>

                      {/* دکمه‌های نشانگر در سمت چپ */}
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() => handleToggleMarker(idx, 'circle')}
                          title="سوال سخت / زمان‌دار (حاشیه زرد)"
                          aria-label={`نشانگر زمان‌دار سوال ${toFarsiDigits(q.questionNumber)}`}
                          className={`w-7 h-7 rounded-md text-xs font-extrabold flex items-center justify-center border transition-colors cursor-pointer ${
                            q.marker === 'circle'
                              ? 'bg-amber-400 text-slate-950 border-amber-500'
                              : 'bg-white text-amber-600 border-slate-200 hover:bg-amber-50'
                          }`}
                        >
                          ○
                        </button>
                        <button
                          type="button"
                          onClick={() => handleToggleMarker(idx, 'minus')}
                          title="سوال شک‌دار (حاشیه آبی)"
                          aria-label={`نشانگر شک‌دار سوال ${toFarsiDigits(q.questionNumber)}`}
                          className={`w-7 h-7 rounded-md text-xs font-extrabold flex items-center justify-center border transition-colors cursor-pointer ${
                            q.marker === 'minus'
                              ? 'bg-sky-500 text-white border-sky-600'
                              : 'bg-white text-sky-600 border-slate-200 hover:bg-sky-50'
                          }`}
                        >
                          −
                        </button>
                        <button
                          type="button"
                          onClick={() => handleToggleMarker(idx, 'cross')}
                          title="سوال نخونده / حذفی (حاشیه قرمز)"
                          aria-label={`نشانگر حذفی سوال ${toFarsiDigits(q.questionNumber)}`}
                          className={`w-7 h-7 rounded-md text-xs font-extrabold flex items-center justify-center border transition-colors cursor-pointer ${
                            q.marker === 'cross'
                              ? 'bg-rose-500 text-white border-rose-600'
                              : 'bg-white text-rose-600 border-slate-200 hover:bg-rose-50'
                          }`}
                        >
                          ×
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="grid grid-cols-5 sm:grid-cols-6 gap-2.5 py-3 max-h-[440px] overflow-y-auto">
                {filteredQuestionsWithIndex.map(({ q, idx }) => (
                  <div
                    key={q.questionNumber}
                    onClick={() => setCurrentIndex(idx)}
                    className={`p-2 rounded-xl flex flex-col items-center gap-1.5 cursor-pointer ${getMarkerRowStyle(
                      q.marker,
                      idx === currentIndex
                    )}`}
                  >
                    <span className="text-xs font-bold text-slate-800 tabular-farsi">
                      {toFarsiDigits(q.questionNumber)}
                    </span>
                    {([1, 2, 3, 4] as OptionChoice[]).map((opt) => {
                      const isSelected = q.selectedOption === opt;
                      return (
                        <button
                          key={opt}
                          type="button"
                          onClick={(ev) => {
                            ev.stopPropagation();
                            setCurrentIndex(idx);
                            handleSelectOption(idx, opt);
                          }}
                          className={`w-6 h-6 rounded-full text-[10px] font-bold tabular-farsi border transition-colors cursor-pointer ${
                            isSelected
                              ? 'bg-[#6338F9] text-white border-[#6338F9]'
                              : 'bg-slate-50 text-slate-600 border-slate-200'
                          }`}
                        >
                          {getOptionLabel(opt, 'alphabetic')}
                        </button>
                      );
                    })}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="pt-4 border-t border-slate-100 space-y-4">
            <div className="grid grid-cols-2 gap-2 text-[11px] text-slate-600">
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-[#6338F9] inline-block" />
                <span>پاسخ داده شده ({toFarsiDigits(answeredCount)})</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-amber-400 inline-block" />
                <span>○ زمان‌دار / سخت ({toFarsiDigits(circleCount)})</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-sky-500 inline-block" />
                <span>− شک‌دار ({toFarsiDigits(minusCount)})</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-rose-500 inline-block" />
                <span>× نخونده / حذفی ({toFarsiDigits(crossCount)})</span>
              </div>
            </div>

            <button
              type="button"
              onClick={() => onFinishExam(exam)}
              className="w-full min-h-[46px] py-3 px-4 rounded-xl bg-[#F3EEFF] hover:bg-[#6338F9] text-[#6338F9] hover:text-white border border-[#6338F9]/25 font-bold text-xs flex items-center justify-center gap-2 transition-all cursor-pointer"
            >
              <BarChart2 className="w-4 h-4" />
              <span>بررسی پاسخ‌ها و صدور کارنامه</span>
            </button>
          </div>
        </aside>
      </main>
    </div>
  );
};

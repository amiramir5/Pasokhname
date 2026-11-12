import React, { useState, useRef } from 'react';
import {
  ArrowRight,
  CheckCircle2,
  XCircle,
  MinusCircle,
  Award,
  Percent,
  Clock,
  KeyRound,
  Sparkles,
  Loader2,
  Eye,
} from 'lucide-react';
import { ExamSession, OptionChoice } from '../types/exam';
import {
  toFarsiDigits,
  formatFarsiPercent,
  formatFarsiTimer,
  getOptionLabel,
  parseAnswerKeyFromTextLocal,
} from '../utils/farsi';
import { calculateExamScore } from '../utils/scoring';
import {
  renderPdfFileToImages,
  loadImageFileToRenderedPage,
  extractAnswerKeyWithAI,
} from '../utils/pdfAndVision';

interface ReportCardViewProps {
  exam: ExamSession;
  optionLabelStyle: 'numeric' | 'alphabetic';
  onUpdateExamWithRecalculatedScore: (updated: ExamSession) => void;
  onBackToDashboard: () => void;
}

export const ReportCardView: React.FC<ReportCardViewProps> = ({
  exam,
  optionLabelStyle,
  onUpdateExamWithRecalculatedScore,
  onBackToDashboard,
}) => {
  const [showKeyEditor, setShowKeyEditor] = useState<boolean>(
    exam.questions.every((q) => q.correctOption === null)
  );
  const [quickKeyText, setQuickKeyText] = useState<string>('');
  const [isExtractingAI, setIsExtractingAI] = useState<boolean>(false);
  const [keyMessage, setKeyMessage] = useState<string | null>(null);
  const [previewQuestionIndex, setPreviewQuestionIndex] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const summary = exam.scoreSummary || calculateExamScore(exam.questions);
  const keyedQuestionsCount = exam.questions.filter((q) => q.correctOption !== null).length;

  const handleSetQuestionKey = (qNum: number, opt: OptionChoice) => {
    const updatedQuestions = exam.questions.map((q) => {
      if (q.questionNumber !== qNum) return q;
      return {
        ...q,
        correctOption: q.correctOption === opt ? null : opt,
      };
    });
    const newScore = calculateExamScore(updatedQuestions);
    onUpdateExamWithRecalculatedScore({
      ...exam,
      questions: updatedQuestions,
      scoreSummary: newScore,
    });
  };

  const handleApplyTextKey = () => {
    const parsed = parseAnswerKeyFromTextLocal(quickKeyText, exam.questionCount);
    const count = Object.keys(parsed).length;
    if (count === 0) {
      setKeyMessage('کلیدی در متن یافت نشد. نمونه فرمت: ۱-۳، ۲-۱، ۳-۴');
      return;
    }
    const updatedQuestions = exam.questions.map((q) => ({
      ...q,
      correctOption: parsed[q.questionNumber] ?? q.correctOption,
    }));
    const newScore = calculateExamScore(updatedQuestions);
    onUpdateExamWithRecalculatedScore({
      ...exam,
      questions: updatedQuestions,
      scoreSummary: newScore,
    });
    setKeyMessage(`کلید ${toFarsiDigits(count)} سوال اعمال شد و کارنامه به‌روز گردید.`);
  };

  const handleExtractKeyFromFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsExtractingAI(true);
    setKeyMessage('در حال استخراج کلید از فایل با هوش مصنوعی...');

    try {
      let imagesPayload: { mimeType: string; data: string }[] = [];
      if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
        const pages = await renderPdfFileToImages(file, 4, 1.6);
        imagesPayload = pages.map((p) => ({ mimeType: 'image/jpeg', data: p.dataUrl }));
      } else {
        const page = await loadImageFileToRenderedPage(file, 1);
        imagesPayload = [{ mimeType: 'image/jpeg', data: page.dataUrl }];
      }

      const res = await extractAnswerKeyWithAI({
        imagesBase64: imagesPayload,
        expectedCount: exam.questionCount,
      });

      const updatedQuestions = exam.questions.map((q) => ({
        ...q,
        correctOption: res.answers[q.questionNumber] ?? q.correctOption,
        explanation: res.explanations[q.questionNumber] ?? q.explanation,
      }));
      const newScore = calculateExamScore(updatedQuestions);
      onUpdateExamWithRecalculatedScore({
        ...exam,
        questions: updatedQuestions,
        scoreSummary: newScore,
      });
      setKeyMessage(
        `کلید ${toFarsiDigits(Object.keys(res.answers).length)} سوال با هوش مصنوعی استخراج و کارنامه تصحیح شد.`
      );
    } catch (err: unknown) {
      setKeyMessage(err instanceof Error ? err.message : 'خطا در استخراج فایل پاسخنامه');
    } finally {
      setIsExtractingAI(false);
      e.target.value = '';
    }
  };

  const avgSecondsPerQuestion =
    exam.questionCount > 0 ? Math.round(exam.elapsedSeconds / exam.questionCount) : 0;

  return (
    <div className="space-y-6">
      {/* نوار بالای کارنامه */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <button
          type="button"
          onClick={onBackToDashboard}
          className="inline-flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-[#6338F9] transition-colors cursor-pointer"
        >
          <ArrowRight className="w-4 h-4" />
          <span>بازگشت به داشبورد</span>
        </button>

        <button
          type="button"
          onClick={() => setShowKeyEditor((v) => !v)}
          className="px-4 py-2 rounded-xl bg-[#F3EEFF] hover:bg-[#6338F9] text-[#6338F9] hover:text-white text-xs font-bold flex items-center gap-2 transition-colors cursor-pointer"
        >
          <KeyRound className="w-4 h-4" />
          <span>
            {showKeyEditor
              ? 'بستن بخش ویرایش کلید پاسخنامه'
              : `ویرایش / ورود کلید پاسخنامه (${toFarsiDigits(keyedQuestionsCount)} از ${toFarsiDigits(exam.questionCount)})`}
          </span>
        </button>
      </div>

      {/* هدر مشخصات کارنامه آزمون */}
      <section className="bg-white rounded-2xl border border-indigo-100/80 p-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1.5">
          <div className="flex items-center gap-2.5 flex-wrap">
            <h1 className="text-xl md:text-2xl font-display-farsi text-slate-900">
              کارنامه آزمون: {exam.title}
            </h1>
            <span className="text-xs text-slate-500">
              · {exam.subject} {exam.topic ? `(${exam.topic})` : ''}
            </span>
          </div>
          <p className="text-xs text-slate-500 tabular-farsi">
            تعداد کل سوالات: {toFarsiDigits(exam.questionCount)} سوال · زمان کل سپری‌شده:{' '}
            {formatFarsiTimer(exam.elapsedSeconds)} · میانگین زمان هر سوال:{' '}
            {toFarsiDigits(avgSecondsPerQuestion)} ثانیه
          </p>
        </div>

        {keyedQuestionsCount < exam.questionCount && (
          <div className="px-3.5 py-2 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-xs font-semibold">
            کلید {toFarsiDigits(keyedQuestionsCount)} از {toFarsiDigits(exam.questionCount)} سوال ثبت شده است
          </div>
        )}
      </section>

      {/* پنل ورود یا استخراج کلید پاسخنامه در صورت نیاز به تصحیح یا ویرایش */}
      {showKeyEditor && (
        <section className="bg-white rounded-2xl border-2 border-[#6338F9]/30 p-6 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
            <div>
              <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-[#6338F9]" />
                <span>ثبت یا استخراج هوشمند کلید پاسخنامه جهت تصحیح کارنامه</span>
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                می‌توانید کلید را روی دکمه‌های زیر بزنید، یا فایل PDF/تصویر/متن پاسخنامه را بدهید تا هوش مصنوعی استخراج کند.
              </p>
            </div>

            <div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,application/pdf,image/*"
                onChange={handleExtractKeyFromFile}
                className="hidden"
              />
              <button
                type="button"
                disabled={isExtractingAI}
                onClick={() => fileInputRef.current?.click()}
                className="px-4 py-2 rounded-xl bg-[#6338F9] hover:bg-[#5228E8] text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer"
              >
                {isExtractingAI ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Sparkles className="w-3.5 h-3.5" />
                )}
                <span>آپلود PDF یا عکس پاسخنامه (AI)</span>
              </button>
            </div>
          </div>

          {keyMessage && (
            <div className="p-3 rounded-xl bg-indigo-50 text-indigo-900 text-xs font-medium">
              {keyMessage}
            </div>
          )}

          <div className="flex flex-col sm:flex-row gap-2">
            <input
              type="text"
              value={quickKeyText}
              onChange={(e) => setQuickKeyText(e.target.value)}
              placeholder="ورود سریع متنی کلید (مثال: ۱-۳، ۲-۱، ۳-۴ یا 31421...)"
              className="flex-1 px-3.5 py-2 rounded-xl border border-slate-200 text-xs"
            />
            <button
              type="button"
              onClick={handleApplyTextKey}
              className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold cursor-pointer"
            >
              اعمال کلید متنی
            </button>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-5 gap-2.5 max-h-60 overflow-y-auto p-1">
            {exam.questions.map((q) => (
              <div
                key={q.questionNumber}
                className="p-2 rounded-xl border border-slate-200 bg-slate-50/70 flex items-center justify-between gap-1"
              >
                <span className="text-xs font-bold text-slate-700 tabular-farsi">
                  {toFarsiDigits(q.questionNumber)}.
                </span>
                <div className="flex items-center gap-1">
                  {([1, 2, 3, 4] as OptionChoice[]).map((opt) => (
                    <button
                      key={opt}
                      type="button"
                      onClick={() => handleSetQuestionKey(q.questionNumber, opt)}
                      className={`w-6 h-6 rounded-md text-[11px] font-bold tabular-farsi cursor-pointer ${
                        q.correctOption === opt
                          ? 'bg-emerald-600 text-white'
                          : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-100'
                      }`}
                    >
                      {getOptionLabel(opt, optionLabelStyle)}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* کارت‌های اصلی کارنامه: درصد با نمره منفی، درصد خام، تعداد درست، غلط و نزده */}
      <section className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        {/* ۱. درصد با نمره منفی */}
        <div className="bg-gradient-to-br from-[#6338F9] to-[#4F26E0] text-white rounded-2xl p-5 flex flex-col justify-between shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-indigo-100">درصد با نمره منفی</span>
            <Award className="w-5 h-5 text-indigo-200" />
          </div>
          <div className="text-3xl font-extrabold tabular-farsi my-2">
            {formatFarsiPercent(summary.netPercentage, 1)}
          </div>
          <span className="text-[11px] text-indigo-100/90">
            فرمول استاندارد کنکور (یک‌سوم)
          </span>
        </div>

        {/* ۲. درصد خام (بدون نمره منفی) */}
        <div className="bg-white rounded-2xl border border-indigo-100/80 p-5 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-600">درصد خام (بدون منفی)</span>
            <Percent className="w-4 h-4 text-[#6338F9]" />
          </div>
          <div className="text-3xl font-extrabold text-slate-900 tabular-farsi my-2">
            {formatFarsiPercent(summary.rawPercentage, 1)}
          </div>
          <span className="text-[11px] text-slate-400">
            نسبت پاسخ صحیح به کل سوالات
          </span>
        </div>

        {/* ۳. تعداد درست */}
        <div className="bg-white rounded-2xl border border-emerald-200/80 p-5 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-emerald-700">پاسخ‌های درست</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="text-3xl font-extrabold text-emerald-600 tabular-farsi my-2">
            {toFarsiDigits(summary.correctCount)}
          </div>
          <span className="text-[11px] text-slate-400 tabular-farsi">
            از مجموع {toFarsiDigits(summary.totalQuestions)} سوال
          </span>
        </div>

        {/* ۴. تعداد غلط */}
        <div className="bg-white rounded-2xl border border-rose-200/80 p-5 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-rose-700">پاسخ‌های غلط</span>
            <XCircle className="w-4 h-4 text-rose-600" />
          </div>
          <div className="text-3xl font-extrabold text-rose-600 tabular-farsi my-2">
            {toFarsiDigits(summary.wrongCount)}
          </div>
          <span className="text-[11px] text-slate-400">
            هر ۳ غلط یک درست را حذف می‌کند
          </span>
        </div>

        {/* ۵. تعداد نزده */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5 flex flex-col justify-between col-span-2 lg:col-span-1">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-600">سوالات نزده</span>
            <MinusCircle className="w-4 h-4 text-slate-400" />
          </div>
          <div className="text-3xl font-extrabold text-slate-700 tabular-farsi my-2">
            {toFarsiDigits(summary.unansweredCount)}
          </div>
          <span className="text-[11px] text-slate-400">
            بدون تاثیر منفی در تراز
          </span>
        </div>
      </section>

      {/* تحلیل عملکرد بر اساس نشانگرهای مدیریت آزمون (○ زمان‌دار زرد، − شک‌دار آبی، × نخونده قرمز) */}
      <section className="bg-white rounded-2xl border border-indigo-100/80 p-6 space-y-4">
        <h2 className="text-base font-bold text-slate-900">
          تحلیل تکنیک مدیریت آزمون (○ زمان‌دار، − شک‌دار، × نخونده/حذفی)
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="p-4 rounded-xl border-2 border-amber-300 bg-amber-50/50 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-amber-900 flex items-center gap-1.5">
                <span className="text-base font-extrabold">○</span>
                <span>سوالات زمان‌دار / سخت (حاشیه زرد)</span>
              </span>
              <span className="text-xs font-extrabold text-amber-900 tabular-farsi">
                {toFarsiDigits(summary.markerStats.circle.total)} سوال
              </span>
            </div>
            <div className="text-xs text-amber-800 flex items-center gap-3 tabular-farsi">
              <span>درست: {toFarsiDigits(summary.markerStats.circle.correct)}</span>
              <span>·</span>
              <span>غلط: {toFarsiDigits(summary.markerStats.circle.wrong)}</span>
              <span>·</span>
              <span>نزده: {toFarsiDigits(summary.markerStats.circle.unanswered)}</span>
            </div>
          </div>

          <div className="p-4 rounded-xl border-2 border-sky-300 bg-sky-50/50 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-sky-900 flex items-center gap-1.5">
                <span className="text-base font-extrabold">−</span>
                <span>سوالات شک‌دار (حاشیه آبی)</span>
              </span>
              <span className="text-xs font-extrabold text-sky-900 tabular-farsi">
                {toFarsiDigits(summary.markerStats.minus.total)} سوال
              </span>
            </div>
            <div className="text-xs text-sky-800 flex items-center gap-3 tabular-farsi">
              <span>درست: {toFarsiDigits(summary.markerStats.minus.correct)}</span>
              <span>·</span>
              <span>غلط: {toFarsiDigits(summary.markerStats.minus.wrong)}</span>
              <span>·</span>
              <span>نزده: {toFarsiDigits(summary.markerStats.minus.unanswered)}</span>
            </div>
          </div>

          <div className="p-4 rounded-xl border-2 border-rose-300 bg-rose-50/50 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-rose-900 flex items-center gap-1.5">
                <span className="text-base font-extrabold">×</span>
                <span>سوالات نخونده / حذفی (حاشیه قرمز)</span>
              </span>
              <span className="text-xs font-extrabold text-rose-900 tabular-farsi">
                {toFarsiDigits(summary.markerStats.cross.total)} سوال
              </span>
            </div>
            <div className="text-xs text-rose-800 flex items-center gap-3 tabular-farsi">
              <span>درست: {toFarsiDigits(summary.markerStats.cross.correct)}</span>
              <span>·</span>
              <span>غلط: {toFarsiDigits(summary.markerStats.cross.wrong)}</span>
              <span>·</span>
              <span>نزده: {toFarsiDigits(summary.markerStats.cross.unanswered)}</span>
            </div>
          </div>
        </div>
      </section>

      {/* پاسخبرگ تحلیلی کلیدی (مقایسه گزینه انتخابی دانش‌آموز با گزینه صحیح) منطبق با پایین تصویر مرجع ۲ */}
      <section className="bg-white rounded-2xl border border-indigo-100/80 p-6 space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 pb-4">
          <h2 className="text-base font-bold text-slate-900">
            پاسخبرگ تحلیلی و مقایسه با کلید
          </h2>
          <div className="flex items-center gap-4 text-xs">
            <span className="flex items-center gap-1.5 text-emerald-700 font-semibold">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              <span>پاسخ صحیح</span>
            </span>
            <span className="flex items-center gap-1.5 text-rose-700 font-semibold">
              <XCircle className="w-4 h-4 text-rose-600" />
              <span>پاسخ غلط</span>
            </span>
            <span className="flex items-center gap-1.5 text-[#6338F9] font-semibold">
              <span className="w-3 h-3 rounded-full bg-[#6338F9] inline-block" />
              <span>گزینه کلید در سوالات نزده/غلط</span>
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {exam.questions.map((q, idx) => {
            const isCorrect =
              q.selectedOption !== null &&
              q.correctOption !== null &&
              q.selectedOption === q.correctOption;
            const isWrong =
              q.selectedOption !== null &&
              q.correctOption !== null &&
              q.selectedOption !== q.correctOption;

            const markerBorder =
              q.marker === 'circle'
                ? 'border-2 border-amber-400 bg-amber-50/40'
                : q.marker === 'minus'
                ? 'border-2 border-sky-400 bg-sky-50/40'
                : q.marker === 'cross'
                ? 'border-2 border-rose-400 bg-rose-50/40'
                : 'border border-slate-200 bg-slate-50/40';

            return (
              <div
                key={q.questionNumber}
                className={`p-3 rounded-xl flex flex-col justify-between gap-2.5 ${markerBorder}`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-bold text-slate-800 tabular-farsi">
                      سوال {toFarsiDigits(q.questionNumber)}
                    </span>
                    {q.marker === 'circle' && (
                      <span className="px-1.5 py-0.5 rounded bg-amber-400 text-slate-950 text-[10px] font-bold">
                        ○ سخت
                      </span>
                    )}
                    {q.marker === 'minus' && (
                      <span className="px-1.5 py-0.5 rounded bg-sky-500 text-white text-[10px] font-bold">
                        − شک‌دار
                      </span>
                    )}
                    {q.marker === 'cross' && (
                      <span className="px-1.5 py-0.5 rounded bg-rose-500 text-white text-[10px] font-bold">
                        × حذفی
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-1.5 text-[11px] text-slate-400 tabular-farsi">
                    <Clock className="w-3 h-3" />
                    <span>{formatFarsiTimer(q.timeSpentSeconds)}</span>
                    {(q.croppedImageUrl || q.explanation || q.note) && (
                      <button
                        type="button"
                        onClick={() =>
                          setPreviewQuestionIndex(previewQuestionIndex === idx ? null : idx)
                        }
                        className="text-[#6338F9] hover:underline flex items-center gap-0.5 cursor-pointer"
                        title="مشاهده تصویر سوال و توضیحات"
                      >
                        <Eye className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>

                {/* ۴ گزینه سوال با رنگ‌بندی کارنامه */}
                <div className="grid grid-cols-4 gap-1.5">
                  {([1, 2, 3, 4] as OptionChoice[]).map((opt) => {
                    const isUserSelected = q.selectedOption === opt;
                    const isKeyCorrect = q.correctOption === opt;

                    let btnStyle = 'bg-white border-slate-200 text-slate-600';
                    if (isUserSelected && isCorrect) {
                      btnStyle = 'bg-emerald-500 border-emerald-600 text-white font-extrabold';
                    } else if (isUserSelected && isWrong) {
                      btnStyle = 'bg-rose-500 border-rose-600 text-white font-extrabold';
                    } else if (isKeyCorrect) {
                      btnStyle = 'bg-[#F3EEFF] border-2 border-[#6338F9] text-[#6338F9] font-extrabold';
                    } else if (isUserSelected) {
                      btnStyle = 'bg-[#6338F9] border-[#6338F9] text-white';
                    }

                    return (
                      <div
                        key={opt}
                        className={`h-8 rounded-lg border text-xs flex items-center justify-center tabular-farsi ${btnStyle}`}
                      >
                        {getOptionLabel(opt, optionLabelStyle)}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        {/* پیش‌نمایش تصویر سوال یا توضیح در صورت کلیک روی آیکون چشم */}
        {previewQuestionIndex !== null && exam.questions[previewQuestionIndex] && (
          <div className="p-4 rounded-2xl bg-[#FAF8FF] border border-indigo-200 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-[#6338F9] tabular-farsi">
                بررسی سوال شماره{' '}
                {toFarsiDigits(exam.questions[previewQuestionIndex].questionNumber)}
              </span>
              <button
                type="button"
                onClick={() => setPreviewQuestionIndex(null)}
                className="text-xs text-slate-500 hover:text-slate-800 cursor-pointer"
              >
                بستن پیش‌نمایش
              </button>
            </div>
            {exam.questions[previewQuestionIndex].croppedImageUrl && (
              <img
                src={exam.questions[previewQuestionIndex].croppedImageUrl}
                alt="تصویر سوال"
                referrerPolicy="no-referrer"
                className="max-h-64 rounded-xl border border-slate-200 mx-auto object-contain bg-white p-2"
              />
            )}
            {exam.questions[previewQuestionIndex].explanation && (
              <p className="text-xs text-slate-700 leading-relaxed bg-white p-3 rounded-xl border border-slate-200">
                <strong className="text-[#6338F9]">پاسخ تشریحی: </strong>
                {exam.questions[previewQuestionIndex].explanation}
              </p>
            )}
            {exam.questions[previewQuestionIndex].note && (
              <p className="text-xs text-slate-600 leading-relaxed bg-white p-3 rounded-xl border border-slate-200">
                <strong>یادداشت شما: </strong>
                {exam.questions[previewQuestionIndex].note}
              </p>
            )}
          </div>
        )}
      </section>
    </div>
  );
};

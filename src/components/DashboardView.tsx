import React, { useState } from 'react';
import {
  Plus,
  BarChart3,
  FileUp,
  ChevronLeft,
  Trash2,
  Play,
  RotateCcw,
  TrendingUp,
  BookOpen,
  Clock,
  Award,
} from 'lucide-react';
import { ExamSession } from '../types/exam';
import {
  toFarsiDigits,
  formatFarsiTimer,
  formatFarsiPercent,
} from '../utils/farsi';
import { computeSubjectProgress } from '../utils/scoring';
import { getAttemptSummary } from '../utils/examAttempts';

interface DashboardViewProps {
  exams: ExamSession[];
  onStartNewExam: () => void;
  onOpenAIExtractor: () => void;
  onOpenAnalytics: () => void;
  onRetakeExam?: (exam: ExamSession) => void;
  onSelectExam: (exam: ExamSession) => void;
  onDeleteExam: (examId: string) => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  exams,
  onStartNewExam,
  onOpenAIExtractor,
  onOpenAnalytics,
  onRetakeExam,
  onSelectExam,
  onDeleteExam,
}) => {
  const completedExams = exams.filter((e) => e.status === 'completed' && e.scoreSummary);
  const subjectStats = computeSubjectProgress(exams);
  const [selectedSubjectFilter, setSelectedSubjectFilter] = useState<string>('ALL');

  const filteredTrendExams = completedExams
    .filter((ex) =>
      selectedSubjectFilter === 'ALL'
        ? true
        : (ex.subject || ex.title || 'عمومی').trim() === selectedSubjectFilter
    )
    .slice()
    .reverse();

  return (
    <div className="space-y-6 pb-20 md:pb-6">
      {/* ۱. بنر خوش‌آمدگویی منطبق با تصویر مرجع */}
      <section className="relative overflow-hidden rounded-2xl bg-gradient-to-l from-[#F6F3FF] via-[#F2EDFF] to-[#E9E1FF] border border-[#E4DCFF] px-5 py-6 md:px-10 md:py-7 flex flex-col sm:flex-row items-center justify-between gap-5">
        <div className="space-y-2 text-right z-10 max-w-xl">
          <h1 className="text-2xl md:text-3xl font-display-farsi text-slate-900 flex items-center gap-2.5">
            <span>به پاسخبرگ خوش آمدید</span>
            <span role="img" aria-label="خوش آمدید">
              👋
            </span>
          </h1>
          <p className="text-xs sm:text-sm md:text-base text-slate-600 leading-relaxed">
            آزمون بسازید، پاسخ دهید و عملکرد خود را تحلیل کنید.
          </p>
        </div>

        {/* تصویر گرافیکی تخته شاسی، پاسخبرگ و کرنومتر */}
        <div className="relative shrink-0 w-44 h-32 md:w-52 md:h-36 select-none" aria-hidden="true">
          <svg viewBox="0 0 240 165" className="w-full h-full drop-shadow-xs">
            <defs>
              <linearGradient id="boardGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#7C5DFA" />
                <stop offset="100%" stopColor="#582BE8" />
              </linearGradient>
              <linearGradient id="paperGrad" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stopColor="#FFFFFF" />
                <stop offset="100%" stopColor="#F5F3FF" />
              </linearGradient>
            </defs>
            <circle cx="125" cy="85" r="68" fill="#DDD4FF" opacity="0.45" />
            <circle cx="65" cy="40" r="6" fill="#A78BFA" opacity="0.6" />
            <circle cx="195" cy="120" r="8" fill="#8B5CF6" opacity="0.4" />
            <g transform="rotate(-6 125 82)">
              <rect x="75" y="18" width="96" height="126" rx="12" fill="url(#boardGrad)" />
              <rect x="83" y="28" width="80" height="108" rx="7" fill="url(#paperGrad)" />
              <rect x="106" y="11" width="34" height="14" rx="5" fill="#312E81" />
              <rect x="93" y="42" width="12" height="12" rx="3" fill="#EDE9FE" stroke="#7C3AED" strokeWidth="1.5" />
              <path d="M96 48 l2.5 2.5 l5 -5" stroke="#6338F9" strokeWidth="2" fill="none" strokeLinecap="round" />
              <rect x="112" y="45" width="40" height="6" rx="3" fill="#CBD5E1" />

              <rect x="93" y="64" width="12" height="12" rx="3" fill="#EDE9FE" stroke="#7C3AED" strokeWidth="1.5" />
              <path d="M96 70 l2.5 2.5 l5 -5" stroke="#6338F9" strokeWidth="2" fill="none" strokeLinecap="round" />
              <rect x="112" y="67" width="34" height="6" rx="3" fill="#CBD5E1" />

              <rect x="93" y="86" width="12" height="12" rx="3" fill="#EDE9FE" stroke="#7C3AED" strokeWidth="1.5" />
              <rect x="112" y="89" width="42" height="6" rx="3" fill="#E2E8F0" />

              <rect x="93" y="108" width="12" height="12" rx="3" fill="#EDE9FE" stroke="#7C3AED" strokeWidth="1.5" />
              <rect x="112" y="111" width="30" height="6" rx="3" fill="#E2E8F0" />
            </g>
            <g transform="translate(42, 82)">
              <rect x="24" y="-8" width="12" height="6" rx="2" fill="#4338CA" />
              <circle cx="30" cy="26" r="28" fill="#4F46E5" />
              <circle cx="30" cy="26" r="22" fill="#FFFFFF" />
              <line x1="30" y1="26" x2="30" y2="12" stroke="#312E81" strokeWidth="2.5" strokeLinecap="round" />
              <line x1="30" y1="26" x2="41" y2="26" stroke="#6338F9" strokeWidth="2.5" strokeLinecap="round" />
              <circle cx="30" cy="26" r="2.5" fill="#312E81" />
            </g>
            <g transform="translate(175, 42) rotate(28)">
              <rect x="0" y="0" width="11" height="72" rx="3" fill="#6338F9" />
              <polygon points="0,72 11,72 5.5,85" fill="#FDE68A" />
              <polygon points="3.5,80 7.5,80 5.5,85" fill="#312E81" />
              <rect x="0" y="-6" width="11" height="8" rx="2" fill="#F472B6" />
            </g>
          </svg>
        </div>
      </section>

      {/* ۲. سه کارت عملیاتی اصلی منطبق با تصویر مرجع (سازگار با موبایل، تبلت و لپ‌تاپ) */}
      <section className="grid grid-cols-1 sm:grid-cols-3 gap-4 md:gap-5">
        <div className="bg-white rounded-2xl border border-indigo-100/80 p-5 md:p-6 flex flex-col items-center text-center justify-between hover:border-[#6338F9]/40 transition-all">
          <div className="flex flex-col items-center">
            <div className="w-12 h-12 rounded-2xl bg-[#6338F9] text-white flex items-center justify-center shadow-sm shadow-[#6338F9]/25 mb-3.5">
              <Plus className="w-6 h-6 stroke-[2.5]" />
            </div>
            <h2 className="text-sm md:text-base font-bold text-slate-900 mb-1.5">
              ساخت آزمون جدید
            </h2>
            <p className="text-xs text-slate-500 leading-relaxed mb-4 max-w-xs">
              آزمون با زمان، تعداد سوال و موضوع دلخواه خود را بسازید.
            </p>
          </div>
          <button
            type="button"
            onClick={onStartNewExam}
            className="w-full max-w-[180px] min-h-[42px] py-2 px-4 rounded-xl border border-[#6338F9]/30 bg-[#F9F7FF] hover:bg-[#6338F9] text-[#6338F9] hover:text-white text-xs font-semibold transition-colors cursor-pointer"
          >
            آزمون جدید بساز
          </button>
        </div>

        <div className="bg-white rounded-2xl border border-indigo-100/80 p-5 md:p-6 flex flex-col items-center text-center justify-between hover:border-[#6338F9]/40 transition-all">
          <div className="flex flex-col items-center">
            <div className="w-12 h-12 rounded-2xl bg-[#F3EEFF] text-[#6338F9] flex items-center justify-center mb-3.5">
              <BarChart3 className="w-6 h-6" />
            </div>
            <h2 className="text-sm md:text-base font-bold text-slate-900 mb-1.5">
              تحلیل و نمودارها
            </h2>
            <p className="text-xs text-slate-500 leading-relaxed mb-4 max-w-xs">
              عملکرد خود را با نمودارهای دقیق و درصدهای هوشمند تحلیل کنید.
            </p>
          </div>
          <button
            type="button"
            onClick={onOpenAnalytics}
            className="w-full max-w-[180px] min-h-[42px] py-2 px-4 rounded-xl border border-[#6338F9]/30 bg-[#F9F7FF] hover:bg-[#6338F9] text-[#6338F9] hover:text-white text-xs font-semibold transition-colors cursor-pointer"
          >
            مشاهده تحلیل‌ها
          </button>
        </div>

        <div className="bg-white rounded-2xl border border-indigo-100/80 p-5 md:p-6 flex flex-col items-center text-center justify-between hover:border-[#6338F9]/40 transition-all">
          <div className="flex flex-col items-center">
            <div className="w-12 h-12 rounded-2xl bg-[#6338F9] text-white flex items-center justify-center shadow-sm shadow-[#6338F9]/25 mb-3.5">
              <FileUp className="w-6 h-6" />
            </div>
            <h2 className="text-sm md:text-base font-bold text-slate-900 mb-1.5">
              استخراج خودکار پاسخنامه
            </h2>
            <p className="text-xs text-slate-500 leading-relaxed mb-4 max-w-xs">
              با هوش مصنوعی پاسخنامه یا سوالات را از PDF، عکس یا متن استخراج کنید.
            </p>
          </div>
          <button
            type="button"
            onClick={onOpenAIExtractor}
            className="w-full max-w-[180px] min-h-[42px] py-2 px-4 rounded-xl border border-[#6338F9]/30 bg-[#F9F7FF] hover:bg-[#6338F9] text-[#6338F9] hover:text-white text-xs font-semibold transition-colors cursor-pointer"
          >
            شروع استخراج
          </button>
        </div>
      </section>

      {/* ۳. لیست آزمون‌های اخیر (در صورت خالی بودن، یک کارت یکپارچه و خلوت نمایش داده می‌شود) */}
      <section className="bg-white rounded-2xl border border-indigo-100/80 p-5 md:p-6">
        <div className="flex items-center justify-between pb-4 mb-2 border-b border-slate-100">
          <h2 className="text-base font-bold text-slate-900">آزمون‌های اخیر</h2>
          {exams.length > 0 && (
            <button
              type="button"
              onClick={onOpenAnalytics}
              className="text-xs font-semibold text-[#6338F9] hover:text-[#5228E8] flex items-center gap-1 cursor-pointer"
            >
              <span>مشاهده همه</span>
              <ChevronLeft className="w-4 h-4" />
            </button>
          )}
        </div>

        {exams.length === 0 ? (
          <div className="py-10 text-center space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-[#F8F6FF] text-[#6338F9] flex items-center justify-center mx-auto">
              <BarChart3 className="w-6 h-6" />
            </div>
            <div className="space-y-1.5 max-w-md mx-auto">
              <div className="text-sm font-bold text-slate-800">
                هنوز هیچ آزمونی ثبت نکرده‌اید
              </div>
              <p className="text-xs text-slate-500 leading-relaxed">
                با ساخت اولین آزمون، تاریخچه کارنامه‌ها و نمودار پیشرفت شما در هر درس به صورت خودکار در این صفحه نمایش داده می‌شود.
              </p>
            </div>
            <button
              type="button"
              onClick={onStartNewExam}
              className="inline-flex items-center gap-2 min-h-[44px] px-5 py-2.5 rounded-xl bg-[#6338F9] hover:bg-[#5228E8] text-white text-xs font-bold transition-all cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>ساخت اولین آزمون</span>
            </button>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {exams.slice(0, 6).map((exam) => {
              const isCompleted = exam.status === 'completed' && exam.scoreSummary;
              const attempt = getAttemptSummary(exams, exam);
              const displayPct = isCompleted
                ? exam.hasNegativeMarking
                  ? exam.scoreSummary!.netPercentage
                  : exam.scoreSummary!.rawPercentage
                : 0;

              return (
                <div
                  key={exam.id}
                  className="py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-slate-50/70 px-3 rounded-xl transition-colors"
                >
                  <div
                    onClick={() => onSelectExam(exam)}
                    className="space-y-1 text-right cursor-pointer flex-1"
                  >
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-sm font-bold text-slate-900">
                        {exam.title}
                        {exam.topic ? ` - ${exam.topic}` : ''}
                      </h3>
                      {exam.subject && (
                        <span className="text-xs text-slate-400">· {exam.subject}</span>
                      )}
                      {attempt.total > 1 && (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200 tabular-farsi">
                          تلاش {toFarsiDigits(attempt.current)} از {toFarsiDigits(attempt.total)}
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-slate-500 tabular-farsi">
                      {toFarsiDigits(exam.questionCount)} سوالی -{' '}
                      {toFarsiDigits(exam.durationMinutes)} دقیقه
                      {isCompleted && (
                        <>
                          {' '}
                          · درست: {toFarsiDigits(exam.scoreSummary!.correctCount)} · غلط:{' '}
                          {toFarsiDigits(exam.scoreSummary!.wrongCount)} · نزده:{' '}
                          {toFarsiDigits(exam.scoreSummary!.unansweredCount)}
                        </>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-3 self-end sm:self-center">
                    <div className="text-center">
                      <div className="px-3 py-1 rounded-lg bg-emerald-50 text-emerald-700 text-xs font-bold tabular-farsi flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5" />
                        <span>{formatFarsiTimer(exam.elapsedSeconds)}</span>
                      </div>
                      <span className="text-[10px] text-slate-400 mt-0.5 block">زمان</span>
                    </div>

                    {isCompleted ? (
                      <div className="text-center">
                        <div className="px-3 py-1 rounded-lg bg-[#F3EEFF] text-[#6338F9] text-xs font-bold tabular-farsi flex items-center gap-1">
                          <Award className="w-3.5 h-3.5" />
                          <span>{formatFarsiPercent(displayPct, 0)}</span>
                        </div>
                        <span className="text-[10px] text-slate-400 mt-0.5 block">درصد</span>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => onSelectExam(exam)}
                        className="min-h-[38px] px-3 py-1.5 rounded-lg bg-[#6338F9] text-white text-xs font-semibold flex items-center gap-1 cursor-pointer"
                      >
                        <Play className="w-3.5 h-3.5" />
                        <span>ادامه</span>
                      </button>
                    )}

                    <div className="flex items-center gap-1">
                      {isCompleted && onRetakeExam && (
                        <button
                          type="button"
                          onClick={() => onRetakeExam(exam)}
                          aria-label={`برگزاری مجدد ${exam.title}`}
                          title="برگزاری مجدد آزمون"
                          className="p-2 rounded-lg text-slate-400 hover:text-[#6338F9] hover:bg-[#F3EEFF] transition-colors cursor-pointer"
                        >
                          <RotateCcw className="w-4 h-4" />
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => onSelectExam(exam)}
                        aria-label={`مشاهده ${exam.title}`}
                        className="p-2 rounded-lg text-slate-400 hover:text-[#6338F9] hover:bg-[#F3EEFF] transition-colors cursor-pointer"
                      >
                        <ChevronLeft className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => onDeleteExam(exam.id)}
                        aria-label={`حذف ${exam.title}`}
                        className="p-2 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* ۴. نمودار پیشرفت کلی و نمودار تفکیکی هر درس (به محض ثبت اولین آزمون نمایش داده می‌شود) */}
      {completedExams.length > 0 && (
        <section className="bg-white rounded-2xl border border-indigo-100/80 p-5 md:p-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-slate-100">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-[#F3EEFF] text-[#6338F9] flex items-center justify-center">
                <TrendingUp className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-base font-bold text-slate-900">
                  نمودار پیشرفت و عملکرد در هر درس
                </h2>
                <p className="text-xs text-slate-500">
                  مقایسه روند درصد با نمره منفی و درصد خام در آزمون‌های ثبت‌شده
                </p>
              </div>
            </div>

            {subjectStats.length > 0 && (
              <div className="flex items-center gap-1.5 flex-wrap">
                <button
                  type="button"
                  onClick={() => setSelectedSubjectFilter('ALL')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                    selectedSubjectFilter === 'ALL'
                      ? 'bg-[#6338F9] text-white'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  همه دروس ({toFarsiDigits(completedExams.length)})
                </button>
                {subjectStats.map((st) => (
                  <button
                    key={st.subject}
                    type="button"
                    onClick={() => setSelectedSubjectFilter(st.subject)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                      selectedSubjectFilter === st.subject
                        ? 'bg-[#6338F9] text-white'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    {st.subject} ({toFarsiDigits(st.examCount)})
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 pt-5">
            <div className="lg:col-span-7 bg-[#FAF9FF] rounded-xl border border-indigo-100/60 p-4">
              <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
                <span className="text-xs font-bold text-slate-700">
                  روند درصد در آزمون‌ها (
                  {selectedSubjectFilter === 'ALL' ? 'همه دروس' : selectedSubjectFilter})
                </span>
                <div className="flex items-center gap-4 text-xs">
                  <span className="flex items-center gap-1.5 text-[#6338F9] font-medium">
                    <span className="w-2.5 h-2.5 rounded-full bg-[#6338F9] inline-block" />
                    درصد با نمره منفی
                  </span>
                  <span className="flex items-center gap-1.5 text-emerald-600 font-medium">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block" />
                    درصد خام
                  </span>
                </div>
              </div>

              {filteredTrendExams.length > 0 && (
                <div className="w-full overflow-x-auto">
                  <svg viewBox="0 0 520 200" className="w-full h-48 min-w-[320px]">
                    {[0, 25, 50, 75, 100].map((val) => {
                      const y = 165 - (val / 100) * 135;
                      return (
                        <g key={val}>
                          <line
                            x1="45"
                            y1={y}
                            x2="495"
                            y2={y}
                            stroke="#E2E8F0"
                            strokeDasharray="4 4"
                            strokeWidth="1"
                          />
                          <text
                            x="38"
                            y={y + 4}
                            textAnchor="end"
                            className="text-[10px] fill-slate-400 tabular-farsi"
                          >
                            {toFarsiDigits(val)}٪
                          </text>
                        </g>
                      );
                    })}

                    {(() => {
                      const items = filteredTrendExams.slice(-8);
                      const count = items.length;
                      const getX = (idx: number) =>
                        count === 1 ? 270 : 65 + (idx / (count - 1)) * 410;
                      const getY = (pct: number) => {
                        const clamped = Math.max(0, Math.min(100, pct));
                        return 165 - (clamped / 100) * 135;
                      };

                      const rawPoints = items
                        .map((ex, idx) => `${getX(idx)},${getY(ex.scoreSummary!.rawPercentage)}`)
                        .join(' ');
                      const netPoints = items
                        .map((ex, idx) => `${getX(idx)},${getY(ex.scoreSummary!.netPercentage)}`)
                        .join(' ');

                      return (
                        <>
                          {count > 1 && (
                            <>
                              <polyline
                                fill="none"
                                stroke="#10B981"
                                strokeWidth="2.5"
                                strokeDasharray="5 3"
                                points={rawPoints}
                              />
                              <polyline
                                fill="none"
                                stroke="#6338F9"
                                strokeWidth="3"
                                points={netPoints}
                              />
                            </>
                          )}
                          {items.map((ex, idx) => {
                            const cx = getX(idx);
                            const cyNet = getY(ex.scoreSummary!.netPercentage);
                            const cyRaw = getY(ex.scoreSummary!.rawPercentage);
                            return (
                              <g key={ex.id}>
                                <circle
                                  cx={cx}
                                  cy={cyRaw}
                                  r="4"
                                  fill="#10B981"
                                  stroke="#FFFFFF"
                                  strokeWidth="1.5"
                                />
                                <circle
                                  cx={cx}
                                  cy={cyNet}
                                  r="5.5"
                                  fill="#6338F9"
                                  stroke="#FFFFFF"
                                  strokeWidth="2"
                                />
                                <text
                                  x={cx}
                                  y={cyNet - 10}
                                  textAnchor="middle"
                                  className="text-[10px] font-bold fill-[#6338F9] tabular-farsi"
                                >
                                  {formatFarsiPercent(ex.scoreSummary!.netPercentage, 0)}
                                </text>
                                <text
                                  x={cx}
                                  y="186"
                                  textAnchor="middle"
                                  className="text-[10px] fill-slate-500"
                                >
                                  {ex.title.slice(0, 10)}
                                </text>
                              </g>
                            );
                          })}
                        </>
                      );
                    })()}
                  </svg>
                </div>
              )}
            </div>

            <div className="lg:col-span-5 bg-[#FAF9FF] rounded-xl border border-indigo-100/60 p-4 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-4">
                  <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                    <BookOpen className="w-4 h-4 text-[#6338F9]" />
                    <span>میانگین عملکرد به تفکیک هر درس</span>
                  </span>
                </div>

                <div className="space-y-3.5">
                  {subjectStats.map((st) => {
                    const barWidthNet = Math.max(4, Math.min(100, st.averageNetPercentage));
                    const barWidthRaw = Math.max(4, Math.min(100, st.averageRawPercentage));
                    return (
                      <div key={st.subject} className="space-y-1.5">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-bold text-slate-800">
                            {st.subject}{' '}
                            <span className="text-slate-400 font-normal">
                              ({toFarsiDigits(st.examCount)} آزمون)
                            </span>
                          </span>
                          <div className="flex items-center gap-2 tabular-farsi">
                            <span className="text-[#6338F9] font-bold">
                              با منفی: {formatFarsiPercent(st.averageNetPercentage)}
                            </span>
                            <span className="text-slate-300">·</span>
                            <span className="text-emerald-600 font-semibold">
                              خام: {formatFarsiPercent(st.averageRawPercentage)}
                            </span>
                          </div>
                        </div>
                        <div className="h-2.5 w-full bg-slate-200/70 rounded-full overflow-hidden relative">
                          <div
                            className="h-full bg-emerald-400/50 rounded-full absolute right-0 top-0 transition-all"
                            style={{ width: `${barWidthRaw}%` }}
                          />
                          <div
                            className="h-full bg-[#6338F9] rounded-full absolute right-0 top-0 transition-all"
                            style={{ width: `${barWidthNet}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="mt-4 pt-3 border-t border-indigo-100/60 flex items-center justify-between text-xs text-slate-500">
                <span>تعداد کل آزمون‌های تصحیح‌شده:</span>
                <span className="font-bold text-slate-800 tabular-farsi">
                  {toFarsiDigits(completedExams.length)} آزمون
                </span>
              </div>
            </div>
          </div>
        </section>
      )}
    </div>
  );
};

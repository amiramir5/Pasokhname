import React, { useState, useEffect } from 'react';
import {
  FileText,
  BarChart3,
  ListChecks,
  Settings as SettingsIcon,
  Plus,
  Trash2,
  ChevronLeft,
  Search,
  Award,
  Clock,
  BookOpen,
  Play,
  CheckCircle2,
  KeyRound,
  Eye,
  EyeOff,
  Loader2,
  Wifi,
  AlertCircle,
  Sparkles,
} from 'lucide-react';
import {
  ExamSession,
  SavedAnswerKeyTemplate,
  AppSettings,
  OptionChoice,
  AIModelPreference,
} from '../types/exam';
import {
  fetchAIStatus,
  getStoredGeminiApiKey,
  saveGeminiApiKey,
  testGeminiConnection,
} from '../utils/pdfAndVision';
import {
  toFarsiDigits,
  formatFarsiPercent,
  formatFarsiTimer,
  getOptionLabel,
  parseAnswerKeyFromTextLocal,
} from '../utils/farsi';
import { computeSubjectProgress } from '../utils/scoring';
import { PWAInstallButton } from './PWAInstallButton';

/* ==========================================
 * ۱. نمای «آزمون‌های من»
 * ========================================== */
interface MyExamsViewProps {
  exams: ExamSession[];
  onStartNewExam: () => void;
  onOpenAnswerKeys?: () => void;
  onSelectExam: (exam: ExamSession) => void;
  onDeleteExam: (examId: string) => void;
}

export const MyExamsView: React.FC<MyExamsViewProps> = ({
  exams,
  onStartNewExam,
  onOpenAnswerKeys,
  onSelectExam,
  onDeleteExam,
}) => {
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'completed' | 'in_progress'>('all');

  const filtered = exams.filter((ex) => {
    const matchesStatus = statusFilter === 'all' ? true : ex.status === statusFilter;
    const q = searchQuery.trim();
    const matchesQuery =
      !q ||
      ex.title.includes(q) ||
      ex.subject.includes(q) ||
      ex.topic.includes(q);
    return matchesStatus && matchesQuery;
  });

  return (
    <div className="space-y-6 pb-20 md:pb-6">
      <div className="bg-white rounded-2xl border border-indigo-100/80 p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#F3EEFF] text-[#6338F9] flex items-center justify-center">
            <FileText className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-slate-900">آزمون‌های من</h1>
            <p className="text-xs text-slate-500 tabular-farsi">
              مجموعاً {toFarsiDigits(exams.length)} آزمون ثبت شده است
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-center">
          {onOpenAnswerKeys && (
            <button
              type="button"
              onClick={onOpenAnswerKeys}
              className="min-h-[42px] px-3.5 py-2 rounded-xl bg-[#F3EEFF] hover:bg-[#E4DCFF] text-[#6338F9] text-xs font-bold flex items-center gap-1.5 cursor-pointer"
            >
              <ListChecks className="w-4 h-4" />
              <span>بانک پاسخنامه‌ها</span>
            </button>
          )}
          <button
            type="button"
            onClick={onStartNewExam}
            className="min-h-[42px] px-4 py-2.5 rounded-xl bg-[#6338F9] hover:bg-[#5228E8] text-white text-xs font-bold flex items-center gap-2 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>ساخت آزمون جدید</span>
          </button>
        </div>
      </div>

      {/* نوار جستجو و فیلتر */}
      <div className="bg-white rounded-2xl border border-indigo-100/80 p-4 flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 text-slate-400 absolute right-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="جستجوی عنوان، درس یا مبحث آزمون..."
            className="w-full pr-10 pl-4 py-2 rounded-xl border border-slate-200 bg-slate-50/60 focus:bg-white focus:border-[#6338F9] focus:outline-none text-xs"
          />
        </div>

        <div className="flex items-center gap-1.5 self-end sm:self-center">
          <button
            type="button"
            onClick={() => setStatusFilter('all')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer ${
              statusFilter === 'all' ? 'bg-[#6338F9] text-white' : 'bg-slate-100 text-slate-600'
            }`}
          >
            همه ({toFarsiDigits(exams.length)})
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter('completed')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer ${
              statusFilter === 'completed'
                ? 'bg-[#6338F9] text-white'
                : 'bg-slate-100 text-slate-600'
            }`}
          >
            تصحیح‌شده ({toFarsiDigits(exams.filter((e) => e.status === 'completed').length)})
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter('in_progress')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer ${
              statusFilter === 'in_progress'
                ? 'bg-[#6338F9] text-white'
                : 'bg-slate-100 text-slate-600'
            }`}
          >
            در حال برگزاری ({toFarsiDigits(exams.filter((e) => e.status === 'in_progress').length)})
          </button>
        </div>
      </div>

      {/* لیست کارت‌های آزمون */}
      <div className="bg-white rounded-2xl border border-indigo-100/80 p-6">
        {filtered.length === 0 ? (
          <div className="py-12 text-center space-y-3">
            <p className="text-sm text-slate-500">هیچ آزمونی با این مشخصات یافت نشد.</p>
            <button
              type="button"
              onClick={onStartNewExam}
              className="px-4 py-2 rounded-xl bg-[#6338F9] text-white text-xs font-bold cursor-pointer"
            >
              + ساخت آزمون جدید
            </button>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {filtered.map((ex) => {
              const isDone = ex.status === 'completed' && ex.scoreSummary;
              return (
                <div
                  key={ex.id}
                  className="py-4 flex flex-col md:flex-row md:items-center justify-between gap-4 hover:bg-slate-50/70 px-3 rounded-xl transition-colors"
                >
                  <div
                    onClick={() => onSelectExam(ex)}
                    className="space-y-1 cursor-pointer flex-1"
                  >
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-bold text-slate-900">
                        {ex.title} {ex.topic ? `– ${ex.topic}` : ''}
                      </span>
                      <span className="text-xs text-slate-400">· {ex.subject}</span>
                    </div>
                    <div className="text-xs text-slate-500 tabular-farsi">
                      {toFarsiDigits(ex.questionCount)} سوال · مهلت:{' '}
                      {toFarsiDigits(ex.durationMinutes)} دقیقه · سطح {ex.difficulty}
                      {isDone && (
                        <>
                          {' '}
                          · درست: {toFarsiDigits(ex.scoreSummary!.correctCount)} · غلط:{' '}
                          {toFarsiDigits(ex.scoreSummary!.wrongCount)} · نزده:{' '}
                          {toFarsiDigits(ex.scoreSummary!.unansweredCount)}
                        </>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-3 self-end md:self-center">
                    <div className="px-3 py-1 rounded-lg bg-emerald-50 text-emerald-700 text-xs font-bold tabular-farsi flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5" />
                      <span>{formatFarsiTimer(ex.elapsedSeconds)}</span>
                    </div>

                    {isDone ? (
                      <div className="flex items-center gap-2">
                        <div className="px-3 py-1 rounded-lg bg-[#F3EEFF] text-[#6338F9] text-xs font-bold tabular-farsi">
                          نمره منفی: {formatFarsiPercent(ex.scoreSummary!.netPercentage, 1)}
                        </div>
                        <div className="px-3 py-1 rounded-lg bg-slate-100 text-slate-700 text-xs font-bold tabular-farsi">
                          خام: {formatFarsiPercent(ex.scoreSummary!.rawPercentage, 1)}
                        </div>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => onSelectExam(ex)}
                        className="px-3 py-1.5 rounded-lg bg-[#6338F9] text-white text-xs font-semibold flex items-center gap-1 cursor-pointer"
                      >
                        <Play className="w-3.5 h-3.5" />
                        <span>ادامه آزمون</span>
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => onSelectExam(ex)}
                      className="p-2 rounded-lg text-slate-400 hover:text-[#6338F9] cursor-pointer"
                      aria-label={`مشاهده کارنامه ${ex.title}`}
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => onDeleteExam(ex.id)}
                      className="p-2 rounded-lg text-slate-400 hover:text-rose-600 cursor-pointer"
                      aria-label={`حذف ${ex.title}`}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

/* ==========================================
 * ۲. نمای «تحلیل عملکرد و نمودار پیشرفت هر درس»
 * ========================================== */
interface AnalyticsViewProps {
  exams: ExamSession[];
  onSelectExam: (exam: ExamSession) => void;
  onStartNewExam: () => void;
}

export const AnalyticsView: React.FC<AnalyticsViewProps> = ({
  exams,
  onSelectExam,
  onStartNewExam,
}) => {
  const completed = exams.filter((e) => e.status === 'completed' && e.scoreSummary);
  const subjectStats = computeSubjectProgress(exams);

  const totalQuestionsAnswered = completed.reduce(
    (acc, e) => acc + (e.scoreSummary?.totalQuestions || 0),
    0
  );
  const avgNetAll =
    completed.length > 0
      ? completed.reduce((acc, e) => acc + e.scoreSummary!.netPercentage, 0) / completed.length
      : 0;
  const avgRawAll =
    completed.length > 0
      ? completed.reduce((acc, e) => acc + e.scoreSummary!.rawPercentage, 0) / completed.length
      : 0;

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-2xl border border-indigo-100/80 p-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#F3EEFF] text-[#6338F9] flex items-center justify-center">
            <BarChart3 className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-slate-900">
              تحلیل جامع عملکرد و نمودار پیشرفت دروس
            </h1>
            <p className="text-xs text-slate-500">
              بررسی روند درصد خام، درصد با نمره منفی و وضعیت هر درس
            </p>
          </div>
        </div>
      </div>

      {completed.length === 0 ? (
        <div className="bg-white rounded-2xl border border-indigo-100/80 p-12 text-center space-y-4">
          <p className="text-sm text-slate-600">
            هنوز آزمونی به پایان نرسیده است تا نمودارهای تحلیلی رسم شوند.
          </p>
          <button
            type="button"
            onClick={onStartNewExam}
            className="px-5 py-2.5 rounded-xl bg-[#6338F9] text-white text-xs font-bold cursor-pointer"
          >
            ساخت اولین آزمون
          </button>
        </div>
      ) : (
        <>
          {/* ۴ شاخص کلیدی کلی */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white rounded-2xl border border-indigo-100/80 p-5">
              <span className="text-xs text-slate-500">میانگین کل (با نمره منفی)</span>
              <div className="text-2xl font-extrabold text-[#6338F9] tabular-farsi mt-2">
                {formatFarsiPercent(avgNetAll, 1)}
              </div>
            </div>
            <div className="bg-white rounded-2xl border border-indigo-100/80 p-5">
              <span className="text-xs text-slate-500">میانگین کل (درصد خام)</span>
              <div className="text-2xl font-extrabold text-emerald-600 tabular-farsi mt-2">
                {formatFarsiPercent(avgRawAll, 1)}
              </div>
            </div>
            <div className="bg-white rounded-2xl border border-indigo-100/80 p-5">
              <span className="text-xs text-slate-500">تعداد آزمون‌های تکمیل‌شده</span>
              <div className="text-2xl font-extrabold text-slate-900 tabular-farsi mt-2">
                {toFarsiDigits(completed.length)} آزمون
              </div>
            </div>
            <div className="bg-white rounded-2xl border border-indigo-100/80 p-5">
              <span className="text-xs text-slate-500">مجموع سوالات بررسی‌شده</span>
              <div className="text-2xl font-extrabold text-slate-900 tabular-farsi mt-2">
                {toFarsiDigits(totalQuestionsAnswered)} سوال
              </div>
            </div>
          </div>

          {/* کارت‌های نمودار پیشرفت اختصاصی هر درس */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {subjectStats.map((st) => (
              <div
                key={st.subject}
                className="bg-white rounded-2xl border border-indigo-100/80 p-6 space-y-4"
              >
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <div className="flex items-center gap-2">
                    <BookOpen className="w-4 h-4 text-[#6338F9]" />
                    <h2 className="text-base font-bold text-slate-900">
                      نمودار پیشرفت درس: {st.subject}
                    </h2>
                  </div>
                  <span className="text-xs text-slate-500 tabular-farsi">
                    {toFarsiDigits(st.examCount)} آزمون
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-2 text-center bg-[#FAF9FF] p-3 rounded-xl border border-indigo-100/60">
                  <div>
                    <div className="text-[11px] text-slate-500">میانگین با منفی</div>
                    <div className="text-sm font-extrabold text-[#6338F9] tabular-farsi mt-0.5">
                      {formatFarsiPercent(st.averageNetPercentage, 1)}
                    </div>
                  </div>
                  <div>
                    <div className="text-[11px] text-slate-500">میانگین خام</div>
                    <div className="text-sm font-extrabold text-emerald-600 tabular-farsi mt-0.5">
                      {formatFarsiPercent(st.averageRawPercentage, 1)}
                    </div>
                  </div>
                  <div>
                    <div className="text-[11px] text-slate-500">بهترین رکورد</div>
                    <div className="text-sm font-extrabold text-amber-600 tabular-farsi mt-0.5">
                      {formatFarsiPercent(st.bestNetPercentage, 1)}
                    </div>
                  </div>
                </div>

                {/* میله‌های روند آزمون‌های این درس */}
                <div className="space-y-2.5 pt-1">
                  {st.history.map((item, idx) => (
                    <div
                      key={item.examId}
                      onClick={() => {
                        const found = exams.find((e) => e.id === item.examId);
                        if (found) onSelectExam(found);
                      }}
                      className="space-y-1 cursor-pointer group"
                    >
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-slate-700 group-hover:text-[#6338F9] font-medium">
                          {toFarsiDigits(idx + 1)}. {item.title}
                        </span>
                        <span className="tabular-farsi font-bold text-slate-800">
                          نمره منفی: {formatFarsiPercent(item.netPercentage, 1)} (خام:{' '}
                          {formatFarsiPercent(item.rawPercentage, 0)})
                        </span>
                      </div>
                      <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-[#6338F9] rounded-full transition-all"
                          style={{
                            width: `${Math.max(4, Math.min(100, item.netPercentage))}%`,
                          }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
};

/* ==========================================
 * ۳. نمای «بانک پاسخنامه‌ها»
 * ========================================== */
interface AnswerKeysBankViewProps {
  savedKeys: SavedAnswerKeyTemplate[];
  optionLabelStyle: 'numeric' | 'alphabetic';
  onSaveKey: (template: Omit<SavedAnswerKeyTemplate, 'id' | 'createdAt'>) => void;
  onDeleteKey: (id: string) => void;
  onGoToCreateExam: () => void;
}

export const AnswerKeysBankView: React.FC<AnswerKeysBankViewProps> = ({
  savedKeys,
  optionLabelStyle,
  onSaveKey,
  onDeleteKey,
  onGoToCreateExam,
}) => {
  const [title, setTitle] = useState<string>('');
  const [subject, setSubject] = useState<string>('زیست‌شناسی');
  const [rawText, setRawText] = useState<string>('');
  const [feedback, setFeedback] = useState<string | null>(null);

  const handleCreateQuickKey = (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = parseAnswerKeyFromTextLocal(rawText, 200);
    const keysCount = Object.keys(parsed).length;
    if (!title.trim() || keysCount === 0) {
      setFeedback('لطفاً عنوان پاسخنامه و متن کلیدها (مثلاً ۱-۳، ۲-۱، ۳-۴) را وارد کنید.');
      return;
    }
    const maxQ = Math.max(...Object.keys(parsed).map(Number), keysCount);
    onSaveKey({
      title: title.trim(),
      subject,
      questionCount: maxQ,
      answers: parsed,
    });
    setTitle('');
    setRawText('');
    setFeedback('پاسخنامه جدید با موفقیت در بانک پاسخنامه‌ها ذخیره شد.');
  };

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-2xl border border-indigo-100/80 p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#F3EEFF] text-[#6338F9] flex items-center justify-center">
            <ListChecks className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-slate-900">بانک پاسخنامه‌ها</h1>
            <p className="text-xs text-slate-500">
              ذخیره و مدیریت کلیدهای آزمون برای استفاده مجدد
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={onGoToCreateExam}
          className="px-4 py-2.5 rounded-xl bg-[#6338F9] text-white text-xs font-bold cursor-pointer"
        >
          استخراج هوشمند پاسخنامه از PDF / عکس
        </button>
      </div>

      <form
        onSubmit={handleCreateQuickKey}
        className="bg-white rounded-2xl border border-indigo-100/80 p-6 space-y-4"
      >
        <h2 className="text-sm font-bold text-slate-900">ثبت کلید جدید در بانک پاسخنامه‌ها</h2>
        {feedback && (
          <div className="p-3 rounded-xl bg-indigo-50 text-indigo-800 text-xs font-medium">
            {feedback}
          </div>
        )}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="عنوان کلید (مثلاً: کلید زیست فصل ۲)"
            className="px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs"
          />
          <input
            type="text"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="نام درس"
            className="px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs"
          />
        </div>
        <textarea
          rows={3}
          value={rawText}
          onChange={(e) => setRawText(e.target.value)}
          placeholder="کلید سوالات را وارد کنید: مثلاً ۱-۳، ۲-۱، ۳-۴، ۴-۲ یا 3142..."
          className="w-full p-3.5 rounded-xl border border-slate-200 text-xs"
        />
        <button
          type="submit"
          className="px-5 py-2.5 rounded-xl bg-[#6338F9] hover:bg-[#5228E8] text-white text-xs font-bold cursor-pointer"
        >
          ذخیره در بانک پاسخنامه‌ها
        </button>
      </form>

      <div className="bg-white rounded-2xl border border-indigo-100/80 p-6">
        {savedKeys.length === 0 ? (
          <p className="text-center text-sm text-slate-500 py-8">
            هنوز پاسخنامه‌ای ذخیره نشده است.
          </p>
        ) : (
          <div className="space-y-3">
            {savedKeys.map((k) => (
              <div
                key={k.id}
                className="p-4 rounded-xl border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
              >
                <div className="space-y-1">
                  <div className="text-sm font-bold text-slate-900">
                    {k.title} <span className="text-xs text-slate-400">· {k.subject}</span>
                  </div>
                  <div className="flex items-center gap-1.5 flex-wrap pt-1">
                    {Object.entries(k.answers)
                      .slice(0, 12)
                      .map(([qNum, opt]) => (
                        <span
                          key={qNum}
                          className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 text-[11px] tabular-farsi"
                        >
                          {toFarsiDigits(qNum)}: {getOptionLabel(opt as OptionChoice, optionLabelStyle)}
                        </span>
                      ))}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => onDeleteKey(k.id)}
                  className="p-2 text-slate-400 hover:text-rose-600 self-end sm:self-center cursor-pointer"
                  aria-label={`حذف ${k.title}`}
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

/* ==========================================
 * ۴. نمای «تنظیمات» (فونت، برچسب گزینه‌ها، پروفایل)
 * ========================================== */
interface SettingsViewProps {
  settings: AppSettings;
  onUpdateSettings: (next: AppSettings) => void;
  onClearAllExams: () => void;
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  settings,
  onUpdateSettings,
  onClearAllExams,
}) => {
  const [savedToast, setSavedToast] = useState<boolean>(false);
  const [confirmClear, setConfirmClear] = useState<boolean>(false);

  // تنظیمات کلید API و مدل هوش مصنوعی
  const [apiKeyInput, setApiKeyInput] = useState<string>(() => getStoredGeminiApiKey());
  const [showApiKey, setShowApiKey] = useState<boolean>(false);
  const [hasServerKey, setHasServerKey] = useState<boolean>(false);
  const [isTestingAI, setIsTestingAI] = useState<boolean>(false);
  const [aiTestResult, setAiTestResult] = useState<{
    type: 'success' | 'error' | 'info';
    text: string;
  } | null>(null);

  useEffect(() => {
    fetchAIStatus().then((st) => setHasServerKey(st.hasServerKey));
  }, []);

  const handleSaveAndTestAI = async () => {
    setIsTestingAI(true);
    setAiTestResult({
      type: 'info',
      text: 'در حال ذخیره کلید و برقراری ارتباط واقعی با Gemini API...',
    });

    try {
      const trimmed = apiKeyInput.trim();
      if (trimmed) {
        const saveRes = await saveGeminiApiKey(trimmed, true);
        if (saveRes.savedToEnvFile) {
          setHasServerKey(true);
        }
      } else {
        await saveGeminiApiKey('', false);
      }

      const testRes = await testGeminiConnection(
        trimmed || undefined,
        settings.aiModelPreference || 'auto'
      );

      if (testRes.success) {
        setAiTestResult({
          type: 'success',
          text: `اتصال با موفقیت برقرار شد! مدل: ${testRes.model} · زمان پاسخ: ${toFarsiDigits(
            testRes.latencyMs ?? 0
          )} میلی‌ثانیه`,
        });
      } else {
        setAiTestResult({
          type: 'error',
          text: testRes.error || 'تست اتصال ناموفق بود.',
        });
      }
    } catch (err: unknown) {
      setAiTestResult({
        type: 'error',
        text: err instanceof Error ? err.message : 'خطا در تست اتصال',
      });
    } finally {
      setIsTestingAI(false);
    }
  };

  const handleChange = <K extends keyof AppSettings>(key: K, val: AppSettings[K]) => {
    onUpdateSettings({
      ...settings,
      [key]: val,
    });
    setSavedToast(true);
    window.setTimeout(() => setSavedToast(false), 2000);
  };

  return (
    <div className="space-y-6 max-w-3xl pb-20 md:pb-6">
      <div className="bg-white rounded-2xl border border-indigo-100/80 p-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#F3EEFF] text-[#6338F9] flex items-center justify-center">
            <SettingsIcon className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-slate-900">تنظیمات سامانه پاسخبرگ</h1>
            <p className="text-xs text-slate-500">
              شخصی‌سازی فونت فارسی، نحوه نمایش گزینه‌ها، نصب PWA و مشخصات داوطلب
            </p>
          </div>
        </div>

        {savedToast && (
          <span className="text-xs font-bold text-emerald-600 flex items-center gap-1">
            <CheckCircle2 className="w-4 h-4" />
            <span>ذخیره شد</span>
          </span>
        )}
      </div>

      {/* کارت تنظیمات کلید API و مدل هوش مصنوعی */}
      <div className="bg-white rounded-2xl border border-indigo-100/80 p-6 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2 border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2">
            <KeyRound className="w-4 h-4 text-[#6338F9]" />
            <h2 className="text-sm font-bold text-slate-900">
              اتصال هوش مصنوعی (Gemini API) و انتخاب مدل
            </h2>
          </div>

          <span
            className={`px-2.5 py-1 rounded-lg text-[11px] font-bold ${
              apiKeyInput.trim() || hasServerKey
                ? 'bg-emerald-50 text-emerald-700'
                : 'bg-amber-50 text-amber-700'
            }`}
          >
            {apiKeyInput.trim()
              ? 'کلید در مرورگر ثبت شده'
              : hasServerKey
              ? 'کلید در سرور (.env) فعال است'
              : 'کلید API تنظیم نشده است'}
          </span>
        </div>

        <p className="text-xs text-slate-500 leading-relaxed">
          برای برش دقیق سوالات PDF و استخراج هوشمند پاسخنامه به کلید Gemini API نیاز است. کلید هم در مرورگر شما و هم در فایل <code className="px-1 py-0.5 rounded bg-slate-100 text-slate-700">.env</code> سرور محلی ذخیره می‌شود.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label htmlFor="gemini-api-key" className="block text-xs font-semibold text-slate-700">
              کلید Gemini API
            </label>
            <div className="relative">
              <input
                id="gemini-api-key"
                type={showApiKey ? 'text' : 'password'}
                dir="ltr"
                value={apiKeyInput}
                onChange={(e) => setApiKeyInput(e.target.value)}
                placeholder="AIzaSy..."
                className="w-full min-h-[42px] pl-10 pr-3.5 py-2.5 rounded-xl border border-slate-200 text-xs font-mono bg-slate-50/50 focus:bg-white focus:border-[#6338F9] focus:outline-none"
              />
              <button
                type="button"
                onClick={() => setShowApiKey((v) => !v)}
                aria-label={showApiKey ? 'مخفی کردن کلید' : 'نمایش کلید'}
                className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                {showApiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="ai-model-select" className="block text-xs font-semibold text-slate-700">
              مدل پردازش تصویر و پاسخنامه
            </label>
            <select
              id="ai-model-select"
              value={settings.aiModelPreference || 'auto'}
              onChange={(e) =>
                handleChange('aiModelPreference', e.target.value as AIModelPreference)
              }
              className="w-full min-h-[42px] px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs bg-white"
            >
              <option value="auto">
                هوشمند (شروع سریع با Gemini 3.6 Flash + ارتقای خودکار به 3.8 Flash در صفحات سخت)
              </option>
              <option value="gemini-3.6-flash">Gemini 3.6 Flash (سریع و متعادل)</option>
              <option value="gemini-3.5-flash-lite">Gemini 3.5 Flash-Lite (فوق‌سریع و سبک)</option>
              <option value="gemini-3.8-flash">Gemini 3.8 Flash (دقیق‌ترین برای صفحات پیچیده)</option>
            </select>
          </div>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap pt-1">
          <button
            type="button"
            disabled={isTestingAI}
            onClick={handleSaveAndTestAI}
            className="min-h-[42px] px-4 py-2 rounded-xl bg-[#6338F9] hover:bg-[#5228E8] disabled:opacity-60 text-white text-xs font-bold flex items-center gap-2 cursor-pointer"
          >
            {isTestingAI ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Wifi className="w-4 h-4" />
            )}
            <span>ذخیره کلید و تست اتصال واقعی</span>
          </button>

          {apiKeyInput.trim() && (
            <button
              type="button"
              onClick={() => {
                setApiKeyInput('');
                saveGeminiApiKey('', false);
                setAiTestResult({
                  type: 'info',
                  text: 'کلید ذخیره‌شده در مرورگر پاک شد.',
                });
              }}
              className="min-h-[42px] px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold cursor-pointer"
            >
              حذف کلید مرورگر
            </button>
          )}
        </div>

        {aiTestResult && (
          <div
            className={`p-3 rounded-xl text-xs font-medium flex items-center gap-2 ${
              aiTestResult.type === 'success'
                ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                : aiTestResult.type === 'error'
                ? 'bg-rose-50 text-rose-800 border border-rose-200'
                : 'bg-indigo-50 text-indigo-800 border border-indigo-200'
            }`}
          >
            {aiTestResult.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 shrink-0" />
            ) : aiTestResult.type === 'error' ? (
              <AlertCircle className="w-4 h-4 shrink-0" />
            ) : (
              <Sparkles className="w-4 h-4 shrink-0" />
            )}
            <span>{aiTestResult.text}</span>
          </div>
        )}
      </div>

      {/* کارت نصب وب‌اپلیکیشن (PWA) روی گوشی، تبلت ویندوزی و لپ‌تاپ */}
      <div className="bg-white rounded-2xl border border-indigo-100/80 p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <img
            src="/icon.svg"
            alt="آیکون پاسخبرگ"
            referrerPolicy="no-referrer"
            className="w-12 h-12 rounded-2xl shadow-xs shrink-0"
          />
          <div className="space-y-1">
            <h2 className="text-sm font-bold text-slate-900">
              نصب نسخه اپلیکیشن (PWA) روی گوشی، تبلت ویندوزی و لپ‌تاپ
            </h2>
            <p className="text-xs text-slate-500 leading-relaxed">
              پاسخبرگ را با آیکون اختصاصی روی صفحه اصلی دستگاه خود نصب کنید تا تمام‌صفحه و سریع اجرا شود.
            </p>
          </div>
        </div>
        <div className="sm:w-56 shrink-0">
          <PWAInstallButton />
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-indigo-100/80 p-6 space-y-5">
        <h2 className="text-sm font-bold text-slate-900 border-b border-slate-100 pb-3">
          مشخصات داوطلب و تایپوگرافی فارسی
        </h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label htmlFor="st-name" className="block text-xs font-semibold text-slate-700">
              نام و نام خانوادگی
            </label>
            <input
              id="st-name"
              type="text"
              value={settings.studentName}
              onChange={(e) => handleChange('studentName', e.target.value)}
              placeholder="نام خود را وارد کنید"
              className="w-full min-h-[42px] px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs"
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="st-field" className="block text-xs font-semibold text-slate-700">
              رشته / آزمون هدف
            </label>
            <input
              id="st-field"
              type="text"
              value={settings.targetField}
              onChange={(e) => handleChange('targetField', e.target.value)}
              placeholder="مثلاً: کنکور تجربی / ریاضی"
              className="w-full min-h-[42px] px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
          <div className="space-y-1.5">
            <label htmlFor="font-style" className="block text-xs font-semibold text-slate-700">
              ترکیب فونت فارسی
            </label>
            <select
              id="font-style"
              value={settings.fontStyle}
              onChange={(e) =>
                handleChange('fontStyle', e.target.value as AppSettings['fontStyle'])
              }
              className="w-full min-h-[42px] px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs"
            >
              <option value="lalezar_headings">تیترهای لاله‌زار + متن وزیرمتن (پیشنهادی)</option>
              <option value="vazirmatn">وزیرمتن یکپارچه (اعداد فارسی)</option>
              <option value="kalameh_bold">وزن ضخیم و خوانا (سبک کلمه)</option>
            </select>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="opt-style" className="block text-xs font-semibold text-slate-700">
              نحوه نمایش گزینه‌ها در پاسخبرگ
            </label>
            <select
              id="opt-style"
              value={settings.optionLabelStyle}
              onChange={(e) =>
                handleChange(
                  'optionLabelStyle',
                  e.target.value as AppSettings['optionLabelStyle']
                )
              }
              className="w-full min-h-[42px] px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs"
            >
              <option value="numeric">اعداد فارسی (۱، ۲، ۳، ۴)</option>
              <option value="alphabetic">حروف فارسی (الف، ب، ج، د)</option>
            </select>
          </div>
        </div>

        <div className="pt-4 border-t border-slate-100 flex items-center justify-between">
          <span className="text-xs text-slate-500">پاکسازی کامل تاریخچه آزمون‌های ذخیره‌شده:</span>
          {!confirmClear ? (
            <button
              type="button"
              onClick={() => setConfirmClear(true)}
              className="min-h-[40px] px-3.5 py-2 rounded-xl border border-rose-200 text-rose-600 hover:bg-rose-50 text-xs font-semibold cursor-pointer"
            >
              پاک کردن همه آزمون‌ها
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  onClearAllExams();
                  setConfirmClear(false);
                }}
                className="min-h-[40px] px-3.5 py-2 rounded-xl bg-rose-600 text-white text-xs font-bold cursor-pointer"
              >
                تایید حذف کامل
              </button>
              <button
                type="button"
                onClick={() => setConfirmClear(false)}
                className="min-h-[40px] px-3 py-2 rounded-xl bg-slate-100 text-slate-700 text-xs cursor-pointer"
              >
                انصراف
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export type OptionChoice = 1 | 2 | 3 | 4;

/**
 * نشانگرهای مدیریت آزمون (تکنیک ضربدر و منها و زمان‌دار):
 * - none: عادی / بدون علامت
 * - circle: دایره (○) — سوال زمان‌دار یا سخت (حاشیه زرد/کهربایی)
 * - minus: منها (−) — سوال شک‌دار بین ۲ گزینه (حاشیه آبی/فیروزه‌ای)
 * - cross: ضربدر (×) — سوال نخونده / حذفی / نرسیده (حاشیه قرمز/رز)
 */
export type QuestionMarker = 'none' | 'circle' | 'minus' | 'cross';

export type DifficultyLevel = 'آسان' | 'متوسط' | 'سخت';

export interface QuestionItemData {
  questionNumber: number;
  selectedOption: OptionChoice | null;
  correctOption: OptionChoice | null;
  marker: QuestionMarker;
  bookmarked: boolean;
  timeSpentSeconds: number;
  /** تصویر برش‌خورده اختصاصی این سوال از فایل PDF یا تصویر آزمون */
  croppedImageUrl?: string;
  /** متن اختیاری سوال یا یادداشت دانش‌آموز */
  note?: string;
  /** توضیح پاسخنامه در صورت استخراج با هوش مصنوعی */
  explanation?: string;
}

export interface ExamScoreSummary {
  totalQuestions: number;
  correctCount: number;
  wrongCount: number;
  unansweredCount: number;
  /** درصد خام (بدون نمره منفی) */
  rawPercentage: number;
  /** درصد با احتساب نمره منفی (فرمول استاندارد کنکور: ۳ برابر درست منهای غلط تقسیم بر ۳ برابر کل) */
  netPercentage: number;
  /** آمار عملکرد به تفکیک نشانگرهای تکنیک مدیریت آزمون */
  markerStats: {
    circle: { total: number; correct: number; wrong: number; unanswered: number };
    minus: { total: number; correct: number; wrong: number; unanswered: number };
    cross: { total: number; correct: number; wrong: number; unanswered: number };
  };
}

export interface ExamSession {
  id: string;
  title: string;
  subject: string;
  topic: string;
  questionCount: number;
  durationMinutes: number;
  difficulty: DifficultyLevel;
  hasNegativeMarking: boolean;
  showScoreImmediately: boolean;
  status: 'in_progress' | 'completed';
  createdAt: string;
  completedAt?: string;
  elapsedSeconds: number;
  questions: QuestionItemData[];
  scoreSummary?: ExamScoreSummary;
}

export interface SavedAnswerKeyTemplate {
  id: string;
  title: string;
  subject: string;
  questionCount: number;
  createdAt: string;
  answers: Record<number, OptionChoice>;
  explanations?: Record<number, string>;
}

export interface AppSettings {
  studentName: string;
  targetField: string;
  fontStyle: 'vazirmatn' | 'lalezar_headings' | 'kalameh_bold';
  optionLabelStyle: 'numeric' | 'alphabetic'; // ۱ ۲ ۳ ۴ vs الف ب ج د
  defaultNegativeMarking: boolean;
  defaultShowScoreImmediately: boolean;
}

export interface BoundingBoxQuestion {
  id: string;
  pageIndex: number;
  questionNumber: number;
  ymin: number; // 0..1000
  xmin: number; // 0..1000
  ymax: number; // 0..1000
  xmax: number; // 0..1000
  croppedDataUrl?: string;
}

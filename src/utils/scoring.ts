import { ExamScoreSummary, ExamSession, QuestionItemData } from '../types/exam';

/**
 * محاسبه دقیق کارنامه آزمون شامل:
 * - درصد خام (بدون نمره منفی)
 * - درصد با نمره منفی (فرمول استاندارد کنکور ایران: هر ۳ غلط یک درست را حذف می‌کند)
 * - تعداد درست، غلط، نزده
 * - تفکیک عملکرد در سوالات علامت‌دار (○ زمان‌دار، − شک‌دار، × نخونده/حذفی)
 */
export function calculateExamScore(questions: QuestionItemData[]): ExamScoreSummary {
  const totalQuestions = questions.length;
  let correctCount = 0;
  let wrongCount = 0;
  let unansweredCount = 0;

  const markerStats = {
    circle: { total: 0, correct: 0, wrong: 0, unanswered: 0 },
    minus: { total: 0, correct: 0, wrong: 0, unanswered: 0 },
    cross: { total: 0, correct: 0, wrong: 0, unanswered: 0 },
  };

  for (const q of questions) {
    const isUnanswered = q.selectedOption === null;
    const isCorrect =
      !isUnanswered && q.correctOption !== null && q.selectedOption === q.correctOption;
    const isWrong =
      !isUnanswered && q.correctOption !== null && q.selectedOption !== q.correctOption;

    if (isUnanswered) {
      unansweredCount++;
    } else if (isCorrect) {
      correctCount++;
    } else if (isWrong) {
      wrongCount++;
    } else {
      // اگر کلید آن سوال خاص هنوز وارد نشده باشد، جزو نزده/تصحیح‌نشده لحاظ می‌شود
      unansweredCount++;
    }

    if (q.marker !== 'none') {
      const bucket = markerStats[q.marker];
      bucket.total++;
      if (isUnanswered) bucket.unanswered++;
      else if (isCorrect) bucket.correct++;
      else if (isWrong) bucket.wrong++;
    }
  }

  if (totalQuestions === 0) {
    return {
      totalQuestions: 0,
      correctCount: 0,
      wrongCount: 0,
      unansweredCount: 0,
      rawPercentage: 0,
      netPercentage: 0,
      markerStats,
    };
  }

  const rawPercentage = Number(((correctCount / totalQuestions) * 100).toFixed(1));
  const netRaw = (((correctCount * 3 - wrongCount) / (totalQuestions * 3)) * 100);
  const netPercentage = Number(Math.max(-33.3, netRaw).toFixed(1));

  return {
    totalQuestions,
    correctCount,
    wrongCount,
    unansweredCount,
    rawPercentage,
    netPercentage,
    markerStats,
  };
}

/**
 * استخراج آمار پیشرفت در هر درس جهت رسم نمودارهای تحلیلی داشبورد
 */
export interface SubjectProgressStat {
  subject: string;
  examCount: number;
  averageNetPercentage: number;
  averageRawPercentage: number;
  latestNetPercentage: number;
  bestNetPercentage: number;
  history: {
    examId: string;
    title: string;
    dateLabel: string;
    netPercentage: number;
    rawPercentage: number;
  }[];
}

export function computeSubjectProgress(exams: ExamSession[]): SubjectProgressStat[] {
  const completedExams = exams
    .filter((e) => e.status === 'completed' && e.scoreSummary)
    .slice()
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

  const bySubject = new Map<string, ExamSession[]>();

  for (const exam of completedExams) {
    const subj = (exam.subject || exam.title || 'عمومی').trim();
    const list = bySubject.get(subj) ?? [];
    list.push(exam);
    bySubject.set(subj, list);
  }

  const stats: SubjectProgressStat[] = [];

  for (const [subject, list] of bySubject.entries()) {
    const history = list.map((ex) => {
      const d = new Date(ex.completedAt || ex.createdAt);
      const dateLabel = d.toLocaleDateString('fa-IR', { month: 'short', day: 'numeric' });
      return {
        examId: ex.id,
        title: ex.title,
        dateLabel,
        netPercentage: ex.scoreSummary!.netPercentage,
        rawPercentage: ex.scoreSummary!.rawPercentage,
      };
    });

    const sumNet = history.reduce((acc, h) => acc + h.netPercentage, 0);
    const sumRaw = history.reduce((acc, h) => acc + h.rawPercentage, 0);
    const bestNet = Math.max(...history.map((h) => h.netPercentage));
    const latestNet = history[history.length - 1]?.netPercentage ?? 0;

    stats.push({
      subject,
      examCount: list.length,
      averageNetPercentage: Number((sumNet / list.length).toFixed(1)),
      averageRawPercentage: Number((sumRaw / list.length).toFixed(1)),
      latestNetPercentage: latestNet,
      bestNetPercentage: bestNet,
      history,
    });
  }

  return stats.sort((a, b) => b.examCount - a.examCount);
}

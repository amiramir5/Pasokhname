import { ExamSession } from '../types/exam';

/** شناسه گروه آزمون؛ آزمون‌های قدیمی که این فیلد را ندارند با شناسه خودشان گروه می‌شوند */
export function getExamGroupId(exam: ExamSession): string {
  return exam.examGroupId || exam.id;
}

export function getAttemptNumber(exam: ExamSession): number {
  const n = Math.floor(Number(exam.attemptNumber) || 1);
  return Math.max(1, n);
}

/** همه تلاش‌های یک آزمون، مرتب بر اساس شماره تلاش */
export function getGroupAttempts(exams: ExamSession[], exam: ExamSession): ExamSession[] {
  const groupId = getExamGroupId(exam);
  return exams
    .filter((item) => getExamGroupId(item) === groupId)
    .slice()
    .sort(
      (a, b) =>
        getAttemptNumber(a) - getAttemptNumber(b) ||
        (a.createdAt || '').localeCompare(b.createdAt || '')
    );
}

/** شماره تلاش فعلی و تعداد کل تلاش‌های این آزمون + آخرین تلاش */
export function getAttemptSummary(
  exams: ExamSession[],
  exam: ExamSession
): { current: number; total: number; latestId?: string } {
  const attempts = getGroupAttempts(exams, exam);
  return {
    current: getAttemptNumber(exam),
    total: Math.max(attempts.length, getAttemptNumber(exam)),
    latestId: attempts[attempts.length - 1]?.id,
  };
}

export function getNextAttemptNumber(exams: ExamSession[], exam: ExamSession): number {
  const attempts = getGroupAttempts(exams, exam);
  const maxAttempt = attempts.reduce((max, item) => Math.max(max, getAttemptNumber(item)), 1);
  return maxAttempt + 1;
}

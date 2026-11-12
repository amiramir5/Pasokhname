import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateExamScore, computeSubjectProgress } from './scoring';
import { toFarsiDigits, fromFarsiDigits, parseAnswerKeyFromTextLocal, formatFarsiTimer } from './farsi';
import { QuestionItemData, ExamSession } from '../types/exam';

test('محاسبه درصد خام و درصد با نمره منفی کنکور', () => {
  const questions: QuestionItemData[] = [
    { questionNumber: 1, selectedOption: 1, correctOption: 1, marker: 'none', bookmarked: false, timeSpentSeconds: 30 },
    { questionNumber: 2, selectedOption: 2, correctOption: 2, marker: 'circle', bookmarked: false, timeSpentSeconds: 75 },
    { questionNumber: 3, selectedOption: 3, correctOption: 1, marker: 'minus', bookmarked: false, timeSpentSeconds: 50 },
    { questionNumber: 4, selectedOption: null, correctOption: 4, marker: 'cross', bookmarked: false, timeSpentSeconds: 5 },
    { questionNumber: 5, selectedOption: 4, correctOption: 4, marker: 'circle', bookmarked: true, timeSpentSeconds: 60 },
  ];

  const summary = calculateExamScore(questions);
  assert.equal(summary.totalQuestions, 5);
  assert.equal(summary.correctCount, 3);
  assert.equal(summary.wrongCount, 1);
  assert.equal(summary.unansweredCount, 1);

  // درصد خام: 3 از 5 = 60%
  assert.equal(summary.rawPercentage, 60);

  // درصد با نمره منفی: ((3*3 - 1) / (5*3)) * 100 = (8 / 15) * 100 = 53.3%
  assert.equal(summary.netPercentage, 53.3);

  // بررسی آمار نشانگرها (دایره، منها، ضربدر)
  assert.equal(summary.markerStats.circle.total, 2);
  assert.equal(summary.markerStats.circle.correct, 2);
  assert.equal(summary.markerStats.minus.total, 1);
  assert.equal(summary.markerStats.minus.wrong, 1);
  assert.equal(summary.markerStats.cross.total, 1);
  assert.equal(summary.markerStats.cross.unanswered, 1);
});

test('تبدیل اعداد فارسی و فرمت زمان‌سنج', () => {
  assert.equal(toFarsiDigits(1234567890), '۱۲۳۴۵۶۷۸۹۰');
  assert.equal(fromFarsiDigits('۱۲۳۴'), '1234');
  assert.equal(formatFarsiTimer(1965), '۳۲:۴۵');
});

test('پارس کردن کلید پاسخنامه از متن فارسی و انگلیسی', () => {
  const parsed1 = parseAnswerKeyFromTextLocal('۱-۳، ۲-الف، ۳: ۴، ۴-ب');
  assert.deepEqual(parsed1, { 1: 3, 2: 1, 3: 4, 4: 2 });

  const parsed2 = parseAnswerKeyFromTextLocal('3142');
  assert.deepEqual(parsed2, { 1: 3, 2: 1, 3: 4, 4: 2 });
});

test('محاسبه نمودار پیشرفت به تفکیک هر درس', () => {
  const mockExams: ExamSession[] = [
    {
      id: '1',
      title: 'زیست ۱',
      subject: 'زیست‌شناسی',
      topic: 'فصل ۱',
      questionCount: 10,
      durationMinutes: 10,
      difficulty: 'متوسط',
      hasNegativeMarking: true,
      showScoreImmediately: true,
      status: 'completed',
      createdAt: '2026-10-01T10:00:00Z',
      elapsedSeconds: 400,
      questions: [],
      scoreSummary: {
        totalQuestions: 10,
        correctCount: 6,
        wrongCount: 0,
        unansweredCount: 4,
        rawPercentage: 60,
        netPercentage: 60,
        markerStats: {
          circle: { total: 0, correct: 0, wrong: 0, unanswered: 0 },
          minus: { total: 0, correct: 0, wrong: 0, unanswered: 0 },
          cross: { total: 0, correct: 0, wrong: 0, unanswered: 0 },
        },
      },
    },
    {
      id: '2',
      title: 'زیست ۲',
      subject: 'زیست‌شناسی',
      topic: 'فصل ۲',
      questionCount: 10,
      durationMinutes: 10,
      difficulty: 'سخت',
      hasNegativeMarking: true,
      showScoreImmediately: true,
      status: 'completed',
      createdAt: '2026-10-05T10:00:00Z',
      elapsedSeconds: 450,
      questions: [],
      scoreSummary: {
        totalQuestions: 10,
        correctCount: 8,
        wrongCount: 0,
        unansweredCount: 2,
        rawPercentage: 80,
        netPercentage: 80,
        markerStats: {
          circle: { total: 0, correct: 0, wrong: 0, unanswered: 0 },
          minus: { total: 0, correct: 0, wrong: 0, unanswered: 0 },
          cross: { total: 0, correct: 0, wrong: 0, unanswered: 0 },
        },
      },
    },
  ];

  const stats = computeSubjectProgress(mockExams);
  assert.equal(stats.length, 1);
  assert.equal(stats[0].subject, 'زیست‌شناسی');
  assert.equal(stats[0].examCount, 2);
  assert.equal(stats[0].averageNetPercentage, 70);
  assert.equal(stats[0].latestNetPercentage, 80);
});

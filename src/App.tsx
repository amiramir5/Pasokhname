import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  ExamSession,
  SavedAnswerKeyTemplate,
  AppSettings,
  OptionChoice,
  DifficultyLevel,
  QuestionItemData,
} from './types/exam';
import { calculateExamScore } from './utils/scoring';
import { getExamGroupId, getNextAttemptNumber, getAttemptSummary } from './utils/examAttempts';
import {
  saveExamImagesToIDB,
  loadExamImagesFromIDB,
  deleteExamImagesFromIDB,
  clearAllImagesFromIDB,
} from './utils/imageStorage';
import { Sidebar, NavTab } from './components/Sidebar';
import { DashboardView } from './components/DashboardView';
import { CreateExamView } from './components/CreateExamView';
import { ActiveExamView } from './components/ActiveExamView';
import { ReportCardView } from './components/ReportCardView';
import {
  MyExamsView,
  AnalyticsView,
  AnswerKeysBankView,
  SettingsView,
} from './components/SecondaryViews';

const STORAGE_KEYS = {
  EXAMS: 'pasokhbarg_exams_v1',
  ANSWER_KEYS: 'pasokhbarg_keys_v1',
  SETTINGS: 'pasokhbarg_settings_v1',
};

const DEFAULT_SETTINGS: AppSettings = {
  studentName: 'حساب کاربری',
  targetField: 'داوطلب کنکور',
  fontStyle: 'lalezar_headings',
  optionLabelStyle: 'numeric',
  defaultNegativeMarking: true,
  defaultShowScoreImmediately: true,
  aiModelPreference: 'auto',
};

function safeSaveExamsToStorage(exams: ExamSession[]) {
  try {
    // تصاویر برش‌خورده در IndexedDB نگهداری می‌شوند تا ظرفیت ۵ مگابایتی localStorage پر نشود
    const stripped = exams.map((ex) => ({
      ...ex,
      questions: ex.questions.map((q) => ({
        ...q,
        croppedImageUrl: undefined,
      })),
    }));
    localStorage.setItem(STORAGE_KEYS.EXAMS, JSON.stringify(stripped));
  } catch (err) {
    console.warn('Could not persist to localStorage:', err);
  }
}

export default function App() {
  // ۱. بارگذاری آزمون‌ها (کاملاً خالی در شروع اولیه طبق تاکید کاربر)
  const [exams, setExams] = useState<ExamSession[]>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.EXAMS);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  });

  // ۲. بارگذاری بانک پاسخنامه‌ها (کاملاً خالی در شروع اولیه)
  const [savedKeys, setSavedKeys] = useState<SavedAnswerKeyTemplate[]>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.ANSWER_KEYS);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  });

  // ۳. تنظیمات برنامه
  const [settings, setSettings] = useState<AppSettings>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.SETTINGS);
      if (!raw) return DEFAULT_SETTINGS;
      return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
    } catch {
      return DEFAULT_SETTINGS;
    }
  });

  // وضعیت ناوبری و آزمون فعال یا کارنامه در حال مشاهده
  const [activeTab, setActiveTab] = useState<NavTab>('dashboard');
  const [createFocusMode, setCreateFocusMode] = useState<'form' | 'ai_key' | 'ai_slicer'>('form');
  const [runningExamId, setRunningExamId] = useState<string | null>(null);
  const [reportExamId, setReportExamId] = useState<string | null>(null);

  const examsRef = useRef(exams);
  examsRef.current = exams;

  // ذخیره با تأخیر کنترل‌شده در localStorage برای جلوگیری از لگ تایمر ۱ ثانیه‌ای
  useEffect(() => {
    const timer = window.setTimeout(() => {
      safeSaveExamsToStorage(exams);
    }, 1200);
    return () => window.clearTimeout(timer);
  }, [exams]);

  useEffect(() => {
    const handleBeforeUnload = () => {
      safeSaveExamsToStorage(examsRef.current);
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, []);

  // بازیابی تصاویر برش‌خورده از IndexedDB هنگام باز کردن آزمون یا کارنامه
  const activeInspectExamId = runningExamId || reportExamId;
  useEffect(() => {
    if (!activeInspectExamId) return;
    let cancelled = false;
    loadExamImagesFromIDB(activeInspectExamId).then((imagesMap) => {
      if (cancelled || Object.keys(imagesMap).length === 0) return;
      setExams((prev) =>
        prev.map((ex) => {
          if (ex.id !== activeInspectExamId) return ex;
          const needsHydrate = ex.questions.some(
            (q) => !q.croppedImageUrl && imagesMap[q.questionNumber]
          );
          if (!needsHydrate) return ex;
          return {
            ...ex,
            questions: ex.questions.map((q) => ({
              ...q,
              croppedImageUrl: q.croppedImageUrl || imagesMap[q.questionNumber],
            })),
          };
        })
      );
    });
    return () => {
      cancelled = true;
    };
  }, [activeInspectExamId]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.ANSWER_KEYS, JSON.stringify(savedKeys));
    } catch (e) {
      console.warn('Could not persist answer keys:', e);
    }
  }, [savedKeys]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(settings));
    } catch (e) {
      console.warn('Could not persist settings:', e);
    }
  }, [settings]);

  // اعمال استایل فونت انتخابی کاربر روی متغیرهای CSS
  useEffect(() => {
    const root = document.documentElement;
    if (settings.fontStyle === 'vazirmatn') {
      root.style.setProperty('--font-display', "'Vazirmatn FD', 'Vazirmatn', sans-serif");
    } else if (settings.fontStyle === 'kalameh_bold') {
      root.style.setProperty('--font-display', "'Vazirmatn FD', 'Vazirmatn', sans-serif");
    } else {
      root.style.setProperty('--font-display', "'Lalezar', 'Vazirmatn FD', sans-serif");
    }
  }, [settings.fontStyle]);

  // ساخت آزمون جدید و ورود مستقیم به جلسه آزمون
  const handleCreateExam = (config: {
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
  }) => {
    const questions: QuestionItemData[] = Array.from(
      { length: config.questionCount },
      (_, idx) => {
        const qNum = idx + 1;
        return {
          questionNumber: qNum,
          selectedOption: null,
          correctOption: config.answerKey[qNum] ?? null,
          marker: 'none',
          bookmarked: false,
          timeSpentSeconds: 0,
          croppedImageUrl: config.croppedImagesByQuestion[qNum],
          explanation: config.explanations[qNum],
        };
      }
    );

    const newExam: ExamSession = {
      id: `exam-${Date.now()}`,
      examGroupId: `group-${Date.now()}`,
      attemptNumber: 1,
      title: config.title,
      subject: config.subject,
      topic: config.topic,
      questionCount: config.questionCount,
      durationMinutes: config.durationMinutes,
      difficulty: config.difficulty,
      hasNegativeMarking: config.hasNegativeMarking,
      showScoreImmediately: config.showScoreImmediately,
      status: 'in_progress',
      createdAt: new Date().toISOString(),
      elapsedSeconds: 0,
      questions,
    };

    void saveExamImagesToIDB(newExam.id, config.croppedImagesByQuestion);
    setExams((prev) => [newExam, ...prev]);
    setRunningExamId(newExam.id);
    setReportExamId(null);
  };

  // به‌روزرسانی لحظه‌ای آزمون در حال برگزاری
  const handleUpdateRunningExam = useCallback((updated: ExamSession) => {
    setExams((prev) => prev.map((e) => (e.id === updated.id ? updated : e)));
  }, []);

  // پایان آزمون و محاسبه کارنامه
  const handleFinishExam = useCallback((finalSession: ExamSession) => {
    const scoreSummary = calculateExamScore(finalSession.questions);
    const completedSession: ExamSession = {
      ...finalSession,
      status: 'completed',
      completedAt: new Date().toISOString(),
      scoreSummary,
    };

    setExams((prev) => prev.map((e) => (e.id === completedSession.id ? completedSession : e)));
    setRunningExamId(null);
    setReportExamId(completedSession.id);
  }, []);

  // برگزاری مجدد آزمون: یک تلاش جدید با همان سوال‌ها، کلید و تصاویر ساخته می‌شود
  const handleRetakeExam = useCallback(async (sourceExam: ExamSession) => {
    const groupId = getExamGroupId(sourceExam);
    const attemptNumber = getNextAttemptNumber(examsRef.current, sourceExam);
    const newExamId = `exam-${Date.now()}`;

    let images: Record<number, string> = {};
    try {
      images = await loadExamImagesFromIDB(sourceExam.id);
    } catch {
      images = {};
    }
    for (const q of sourceExam.questions) {
      if (!images[q.questionNumber] && q.croppedImageUrl) {
        images[q.questionNumber] = q.croppedImageUrl;
      }
    }

    const newExam: ExamSession = {
      ...sourceExam,
      id: newExamId,
      examGroupId: groupId,
      attemptNumber,
      status: 'in_progress',
      createdAt: new Date().toISOString(),
      completedAt: undefined,
      elapsedSeconds: 0,
      scoreSummary: undefined,
      questions: sourceExam.questions.map((q) => ({
        ...q,
        selectedOption: null,
        marker: 'none',
        bookmarked: false,
        timeSpentSeconds: 0,
        croppedImageUrl: images[q.questionNumber] || q.croppedImageUrl,
      })),
    };

    if (Object.keys(images).length > 0) {
      void saveExamImagesToIDB(newExamId, images);
    }

    setExams((prev) => [newExam, ...prev]);
    setReportExamId(null);
    setRunningExamId(newExamId);
  }, []);

  const handleDeleteExam = (examId: string) => {    void deleteExamImagesFromIDB(examId);
    setExams((prev) => prev.filter((e) => e.id !== examId));
    if (runningExamId === examId) setRunningExamId(null);
    if (reportExamId === examId) setReportExamId(null);
  };

  // خروجی فایل پشتیبان (Export Backup)
  const handleExportBackup = () => {
    const backupData = {
      version: 1,
      exportedAt: new Date().toISOString(),
      exams,
      savedKeys,
      settings,
    };
    const blob = new Blob([JSON.stringify(backupData, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `pasokhbarg-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // بازیابی فایل پشتیبان (Import Backup)
  const handleImportBackup = async (
    file: File
  ): Promise<{ success: boolean; count: number; error?: string }> => {
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      if (!data || !Array.isArray(data.exams)) {
        return { success: false, count: 0, error: 'فرمت فایل پشتیبان نامعتبر است.' };
      }
      setExams(data.exams);
      if (Array.isArray(data.savedKeys)) {
        setSavedKeys(data.savedKeys);
      }
      if (data.settings && typeof data.settings === 'object') {
        setSettings((prev) => ({ ...prev, ...data.settings }));
      }
      return { success: true, count: data.exams.length };
    } catch (err) {
      return {
        success: false,
        count: 0,
        error: err instanceof Error ? err.message : 'خطا در خواندن فایل',
      };
    }
  };

  const handleSaveKeyTemplate = (
    template: Omit<SavedAnswerKeyTemplate, 'id' | 'createdAt'>
  ) => {
    const newItem: SavedAnswerKeyTemplate = {
      ...template,
      id: `key-${Date.now()}`,
      createdAt: new Date().toISOString(),
    };
    setSavedKeys((prev) => [newItem, ...prev]);
  };

  const handleDeleteKeyTemplate = (id: string) => {
    setSavedKeys((prev) => prev.filter((k) => k.id !== id));
  };

  const runningExam = runningExamId ? exams.find((e) => e.id === runningExamId) : null;
  const reportExam = reportExamId ? exams.find((e) => e.id === reportExamId) : null;

  // اگر آزمونی در حال برگزاری است، نمای تمام‌صفحه جلسه آزمون (منطبق با تصویر مرجع ۱) نمایش داده می‌شود
  if (runningExam) {
    return (
      <ActiveExamView
        exam={runningExam}
        optionLabelStyle={settings.optionLabelStyle}
        onUpdateExam={handleUpdateRunningExam}
        onFinishExam={handleFinishExam}
        onExitWithoutFinishing={() => setRunningExamId(null)}
      />
    );
  }

  return (
    <div
      dir="rtl"
      className={`min-h-screen bg-[#F6F7FB] flex flex-col md:flex-row ${
        settings.fontStyle === 'kalameh_bold' ? 'font-semibold' : ''
      }`}
    >
      {/* سایدبار سمت راست در دسکتاپ/تبلت و نوار پایین انگشت‌محور در موبایل */}
      <Sidebar
        activeTab={activeTab}
        onSelectTab={(tab) => {
          setReportExamId(null);
          setCreateFocusMode('form');
          setActiveTab(tab);
        }}
        completedExamsCount={exams.length}
        savedKeysCount={savedKeys.length}
        studentName={settings.studentName}
        targetField={settings.targetField}
      />

      {/* محتوای اصلی */}
      <main className="flex-1 min-w-0 p-4 pb-24 md:p-6 lg:p-8 md:pb-8 max-w-[1250px] w-full mx-auto">
        {reportExam ? (
          <ReportCardView
            exam={reportExam}
            optionLabelStyle={settings.optionLabelStyle}
            attemptSummary={getAttemptSummary(exams, reportExam)}
            onRetakeExam={() => void handleRetakeExam(reportExam)}
            onUpdateExamWithRecalculatedScore={(updated) => {
              setExams((prev) => prev.map((e) => (e.id === updated.id ? updated : e)));
            }}
            onBackToDashboard={() => {
              setReportExamId(null);
              setActiveTab('dashboard');
            }}
          />
        ) : activeTab === 'dashboard' ? (
          <DashboardView
            exams={exams}
            onStartNewExam={() => {
              setCreateFocusMode('form');
              setActiveTab('create_exam');
            }}
            onOpenAIExtractor={() => {
              setCreateFocusMode('ai_key');
              setActiveTab('create_exam');
            }}
            onOpenAnalytics={() => setActiveTab('analytics')}
            onRetakeExam={(ex) => void handleRetakeExam(ex)}
            onSelectExam={(ex) => {
              if (ex.status === 'in_progress') {
                setRunningExamId(ex.id);
              } else {
                setReportExamId(ex.id);
              }
            }}
            onDeleteExam={handleDeleteExam}
          />
        ) : activeTab === 'create_exam' ? (
          <CreateExamView
            initialFocusMode={createFocusMode}
            optionLabelStyle={settings.optionLabelStyle}
            defaultNegativeMarking={settings.defaultNegativeMarking}
            defaultShowScoreImmediately={settings.defaultShowScoreImmediately}
            savedAnswerKeys={savedKeys}
            onSaveAnswerKeyTemplate={handleSaveKeyTemplate}
            onCreateExam={handleCreateExam}
            onCancel={() => setActiveTab('dashboard')}
          />
        ) : activeTab === 'my_exams' ? (
          <MyExamsView
            exams={exams}
            onStartNewExam={() => setActiveTab('create_exam')}
            onOpenAnswerKeys={() => setActiveTab('answer_keys')}
            onRetakeExam={(ex) => void handleRetakeExam(ex)}
            onSelectExam={(ex) => {
              if (ex.status === 'in_progress') {
                setRunningExamId(ex.id);
              } else {
                setReportExamId(ex.id);
              }
            }}
            onDeleteExam={handleDeleteExam}
          />
        ) : activeTab === 'analytics' ? (
          <AnalyticsView
            exams={exams}
            onSelectExam={(ex) => setReportExamId(ex.id)}
            onStartNewExam={() => setActiveTab('create_exam')}
          />
        ) : activeTab === 'answer_keys' ? (
          <AnswerKeysBankView
            savedKeys={savedKeys}
            optionLabelStyle={settings.optionLabelStyle}
            onSaveKey={handleSaveKeyTemplate}
            onDeleteKey={handleDeleteKeyTemplate}
            onGoToCreateExam={() => {
              setCreateFocusMode('ai_key');
              setActiveTab('create_exam');
            }}
          />
        ) : (
          <SettingsView
            settings={settings}
            onUpdateSettings={setSettings}
            onExportBackup={handleExportBackup}
            onImportBackup={handleImportBackup}
            onClearAllExams={() => {
              void clearAllImagesFromIDB();
              setExams([]);
              setRunningExamId(null);
              setReportExamId(null);
            }}
          />
        )}
      </main>
    </div>
  );
}

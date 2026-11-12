import React from 'react';
import {
  Home,
  FileText,
  BarChart3,
  Settings,
  Plus,
  User,
} from 'lucide-react';
import { toFarsiDigits } from '../utils/farsi';
import { PWAInstallButton } from './PWAInstallButton';

export type NavTab =
  | 'dashboard'
  | 'create_exam'
  | 'my_exams'
  | 'analytics'
  | 'answer_keys'
  | 'settings';

interface SidebarProps {
  activeTab: NavTab;
  onSelectTab: (tab: NavTab) => void;
  completedExamsCount: number;
  savedKeysCount: number;
  studentName: string;
  targetField: string;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  onSelectTab,
  completedExamsCount,
  studentName,
  targetField,
}) => {
  // منوی خلوت، سرراست و کاربردی (۴ بخش اصلی)
  const navItems: {
    id: NavTab;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    badge?: number;
  }[] = [
    { id: 'dashboard', label: 'داشبورد', icon: Home },
    { id: 'my_exams', label: 'آزمون‌های من', icon: FileText, badge: completedExamsCount },
    { id: 'analytics', label: 'تحلیل پیشرفت', icon: BarChart3 },
    { id: 'settings', label: 'تنظیمات', icon: Settings },
  ];

  return (
    <>
      {/* سایدبار تبلت ویندوزی و لپ‌تاپ (از عرض md به بالا) */}
      <aside className="hidden md:flex flex-col w-60 lg:w-64 shrink-0 bg-white border-l border-indigo-100/80 md:sticky md:top-0 md:h-screen px-4 py-6 justify-between select-none">
        <div>
          {/* لوگو و آیکون اختصاصی پاسخبرگ */}
          <div className="flex items-center justify-between px-2 mb-6">
            <button
              type="button"
              onClick={() => onSelectTab('dashboard')}
              className="flex items-center gap-3 group text-right focus:outline-none cursor-pointer"
            >
              <img
                src={`${import.meta.env.BASE_URL}icon.svg`}
                alt="آیکون پاسخبرگ"
                referrerPolicy="no-referrer"
                className="w-10 h-10 rounded-xl shadow-sm shadow-[#6338F9]/20 group-hover:scale-105 transition-transform"
              />
              <span className="text-2xl font-display-farsi text-slate-900 tracking-tight">
                پاسخبرگ
              </span>
            </button>
          </div>

          {/* دکمه اصلی آزمون جدید با ابعاد استاندارد لمسی و ماوس */}
          <button
            type="button"
            onClick={() => onSelectTab('create_exam')}
            className="w-full min-h-[46px] py-3 px-4 rounded-xl bg-[#6338F9] hover:bg-[#5228E8] active:scale-[0.99] text-white font-bold text-sm flex items-center justify-center gap-2 shadow-sm shadow-[#6338F9]/20 transition-all mb-6 cursor-pointer"
          >
            <Plus className="w-4 h-4 stroke-[2.5]" />
            <span>آزمون جدید</span>
          </button>

          {/* منوی ناوبری خلوت و خوانا */}
          <nav className="space-y-1.5" aria-label="منوی اصلی">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive =
                activeTab === item.id ||
                (item.id === 'my_exams' && activeTab === 'answer_keys');
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onSelectTab(item.id)}
                  className={`w-full min-h-[44px] flex items-center justify-between px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all cursor-pointer ${
                    isActive
                      ? 'bg-[#F3EEFF] text-[#6338F9] font-bold'
                      : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <Icon
                      className={`w-5 h-5 ${
                        isActive ? 'text-[#6338F9]' : 'text-slate-400'
                      }`}
                    />
                    <span>{item.label}</span>
                  </div>
                  {item.badge !== undefined && item.badge > 0 && (
                    <span
                      className={`text-xs tabular-farsi px-2 py-0.5 rounded-md ${
                        isActive
                          ? 'bg-[#6338F9]/15 text-[#6338F9] font-bold'
                          : 'bg-slate-100 text-slate-600'
                      }`}
                    >
                      {toFarsiDigits(item.badge)}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        </div>

        {/* بخش پایین سایدبار: دکمه نصب PWA + پروفایل داوطلب */}
        <div className="space-y-3 pt-4 border-t border-slate-100">
          <PWAInstallButton />

          <button
            type="button"
            onClick={() => onSelectTab('settings')}
            className="w-full min-h-[48px] flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-slate-50 transition-colors text-right cursor-pointer"
          >
            <div className="w-9 h-9 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-500 shrink-0">
              <User className="w-4 h-4" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold text-slate-700 truncate">
                {studentName || 'حساب کاربری'}
              </div>
              <div className="text-xs text-slate-400 truncate">
                {targetField || 'داوطلب آزمون'}
              </div>
            </div>
          </button>
        </div>
      </aside>

      {/* هدر بالای موبایل (کم‌حجم و تمیز) */}
      <header className="md:hidden bg-white/95 backdrop-blur-md border-b border-indigo-100/80 px-4 h-14 flex items-center justify-between sticky top-0 z-30">
        <button
          type="button"
          onClick={() => onSelectTab('dashboard')}
          className="flex items-center gap-2.5 cursor-pointer"
        >
          <img
            src={`${import.meta.env.BASE_URL}icon.svg`}
            alt="آیکون پاسخبرگ"
            referrerPolicy="no-referrer"
            className="w-8 h-8 rounded-lg shadow-2xs"
          />
          <span className="text-xl font-display-farsi text-slate-900">پاسخبرگ</span>
        </button>

        <div className="flex items-center gap-2">
          <PWAInstallButton compact />
        </div>
      </header>

      {/* نوار ناوبری پایین موبایل (Thumb-Zone) برای کاربری راحت با یک دست */}
      <nav
        aria-label="منوی موبایل"
        className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-indigo-100/90 px-2 h-16 grid grid-cols-5 items-center select-none"
      >
        <button
          type="button"
          onClick={() => onSelectTab('dashboard')}
          className={`flex flex-col items-center justify-center min-h-[48px] rounded-xl transition-colors cursor-pointer ${
            activeTab === 'dashboard' ? 'text-[#6338F9] font-bold' : 'text-slate-500'
          }`}
        >
          <Home className="w-5 h-5" />
          <span className="text-[10px] mt-1">داشبورد</span>
        </button>

        <button
          type="button"
          onClick={() => onSelectTab('my_exams')}
          className={`flex flex-col items-center justify-center min-h-[48px] rounded-xl transition-colors cursor-pointer ${
            activeTab === 'my_exams' || activeTab === 'answer_keys'
              ? 'text-[#6338F9] font-bold'
              : 'text-slate-500'
          }`}
        >
          <FileText className="w-5 h-5" />
          <span className="text-[10px] mt-1">آزمون‌ها</span>
        </button>

        {/* دکمه برجسته میانی برای ساخت آزمون جدید */}
        <div className="flex items-center justify-center">
          <button
            type="button"
            onClick={() => onSelectTab('create_exam')}
            aria-label="آزمون جدید"
            className="w-12 h-12 rounded-2xl bg-[#6338F9] text-white flex flex-col items-center justify-center shadow-md shadow-[#6338F9]/30 active:scale-95 transition-transform cursor-pointer"
          >
            <Plus className="w-6 h-6 stroke-[2.5]" />
          </button>
        </div>

        <button
          type="button"
          onClick={() => onSelectTab('analytics')}
          className={`flex flex-col items-center justify-center min-h-[48px] rounded-xl transition-colors cursor-pointer ${
            activeTab === 'analytics' ? 'text-[#6338F9] font-bold' : 'text-slate-500'
          }`}
        >
          <BarChart3 className="w-5 h-5" />
          <span className="text-[10px] mt-1">پیشرفت</span>
        </button>

        <button
          type="button"
          onClick={() => onSelectTab('settings')}
          className={`flex flex-col items-center justify-center min-h-[48px] rounded-xl transition-colors cursor-pointer ${
            activeTab === 'settings' ? 'text-[#6338F9] font-bold' : 'text-slate-500'
          }`}
        >
          <Settings className="w-5 h-5" />
          <span className="text-[10px] mt-1">تنظیمات</span>
        </button>
      </nav>
    </>
  );
};

import React, { useState } from 'react';
import { Download, Smartphone, X, CheckCircle2 } from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';
import { getDeferredInstallPrompt } from '../utils/pwaInstallPrompt';

interface PWAInstallButtonProps {
  compact?: boolean;
}

export const PWAInstallButton: React.FC<PWAInstallButtonProps> = ({ compact = false }) => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showGuideModal, setShowGuideModal] = useState(false);

  if (isInstalled) {
    if (compact) return null;
    return (
      <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-emerald-50 text-emerald-700 text-xs font-medium">
        <CheckCircle2 className="w-4 h-4 shrink-0" />
        <span>نسخه وب‌اپلیکیشن (PWA) فعال است</span>
      </div>
    );
  }

  const handleClick = async () => {
    // اگر مرورگر رویداد نصب را داده باشد، مستقیماً پنجره نصب خودش را باز می‌کنیم.
    if (isInstallable || getDeferredInstallPrompt()) {
      await install();
      return;
    }
    setShowGuideModal(true);
  };

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        className={
          compact
            ? 'min-h-[40px] px-3 py-1.5 rounded-xl bg-[#F3EEFF] hover:bg-[#6338F9] text-[#6338F9] hover:text-white text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer shrink-0'
            : 'w-full min-h-[44px] px-3.5 py-2.5 rounded-xl bg-[#F8F6FF] hover:bg-[#EDE7FF] border border-[#6338F9]/25 text-[#6338F9] text-xs font-bold flex items-center justify-center gap-2 transition-colors cursor-pointer'
        }
      >
        <Download className="w-4 h-4 shrink-0" />
        <span>{compact ? 'نصب اپ' : 'نصب وب‌اپلیکیشن (PWA)'}</span>
      </button>

      {showGuideModal && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4"
          onClick={() => setShowGuideModal(false)}
        >
          <div
            className="bg-white rounded-2xl border border-indigo-100 max-w-md w-full p-6 space-y-4 shadow-xl text-right"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-[#F3EEFF] text-[#6338F9] flex items-center justify-center">
                  <Smartphone className="w-5 h-5" />
                </div>
                <h3 className="text-base font-bold text-slate-900">
                  راهنمای نصب اپلیکیشن «پاسخبرگ»
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowGuideModal(false)}
                aria-label="بستن راهنمای نصب"
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {isIOS ? (
              <div className="space-y-2.5 text-xs text-slate-600 leading-relaxed">
                <p className="font-bold text-slate-800">نصب در آیفون و آیپد (Safari):</p>
                <p>۱. روی دکمه اشتراک‌گذاری (Share) در نوار پایین مرورگر سافاری بزنید.</p>
                <p>۲. گزینه <strong>Add to Home Screen</strong> را انتخاب کنید تا آیکون پاسخبرگ به صفحه اصلی اضافه شود.</p>
              </div>
            ) : (
              <div className="space-y-2.5 text-xs text-slate-600 leading-relaxed">
                <p className="font-bold text-slate-800">
                  نصب در ویندوز (تبلت و لپ‌تاپ) و اندروید:
                </p>
                <p>
                  ۱. در مرورگر Chrome یا Edge، روی آیکون نصب (کنار نوار آدرس بالا) یا منوی سه نقطه بزنید.
                </p>
                <p>
                  ۲. گزینه <strong>Install Pasokhbarg / Add to Home Screen</strong> را انتخاب کنید تا برنامه به صورت مستقل و تمام‌صفحه اجرا شود.
                </p>
              </div>
            )}

            <button
              type="button"
              onClick={() => setShowGuideModal(false)}
              className="w-full min-h-[44px] py-2.5 rounded-xl bg-[#6338F9] hover:bg-[#5228E8] text-white text-xs font-bold cursor-pointer"
            >
              متوجه شدم
            </button>
          </div>
        </div>
      )}
    </>
  );
};

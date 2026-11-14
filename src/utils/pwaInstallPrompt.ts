/**
 * گرفتن رویداد beforeinstallprompt در همان لحظه‌ای که مرورگر آن را می‌فرستد.
 *
 * اگر این listener داخل یک کامپوننت React ثبت شود، ممکن است رویداد قبل از mount شدن
 * کامپوننت رخ بدهد و از دست برود؛ نتیجه‌اش این است که دکمه «نصب» همیشه فقط راهنما
 * نشان می‌دهد. این ماژول به‌صورت ماژول‌سطح (قبل از render) import می‌شود تا رویداد را
 * زودتر از همه جا بگیرد و برای دکمه‌ی نصب نگه دارد.
 */

export interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

let deferredPrompt: BeforeInstallPromptEvent | null = null;
const listeners = new Set<(available: boolean) => void>();

function notify() {
  listeners.forEach((listener) => listener(Boolean(deferredPrompt)));
}

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (event) => {
    // جلوگیری از نمایش نوار نصب خودکار مرورگر؛ نصب فقط با کلیک کاربر انجام می‌شود.
    event.preventDefault();
    deferredPrompt = event as BeforeInstallPromptEvent;
    notify();
  });

  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    notify();
  });
}

export function isStandaloneMode(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

export function getDeferredInstallPrompt(): BeforeInstallPromptEvent | null {
  return deferredPrompt;
}

export function subscribeInstallAvailability(callback: (available: boolean) => void): () => void {
  listeners.add(callback);
  callback(Boolean(deferredPrompt));
  return () => {
    listeners.delete(callback);
  };
}

/**
 * اجرای پنجره نصب واقعی مرورگر. اگر مرورگر هنوز رویداد نصب را نداده باشد false برمی‌گرداند.
 */
export async function promptInstall(): Promise<boolean> {
  if (!deferredPrompt) return false;

  const event = deferredPrompt;
  try {
    await event.prompt();
    const { outcome } = await event.userChoice;
    deferredPrompt = null;
    notify();
    return outcome === 'accepted';
  } catch {
    return false;
  }
}

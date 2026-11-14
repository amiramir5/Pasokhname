import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
// باید قبل از هر چیز import شود تا رویداد beforeinstallprompt از دست نرود
import './utils/pwaInstallPrompt';
import App from './App.tsx';
import './index.css';

// ثبت سرویس‌ورکر PWA برای نصب‌پذیری و اجرای آفلاین
registerSW({ immediate: true });

createRoot(document.getElementById('root')!).render(<App />);

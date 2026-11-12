import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import App from './App.tsx';
import './index.css';

// ثبت سرویس‌ورکر PWA برای نصب‌پذیری و اجرای آفلاین
registerSW({ immediate: true });

createRoot(document.getElementById('root')!).render(<App />);

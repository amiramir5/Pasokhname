import { useEffect, useState } from 'react';
import {
  getDeferredInstallPrompt,
  isStandaloneMode,
  promptInstall,
  subscribeInstallAvailability,
} from '../utils/pwaInstallPrompt';

export function usePWAInstall() {
  const [isInstallable, setIsInstallable] = useState(() => Boolean(getDeferredInstallPrompt()));
  const [isInstalled, setIsInstalled] = useState(false);
  const [isIOS, setIsIOS] = useState(false);

  useEffect(() => {
    setIsInstalled(isStandaloneMode());
    setIsIOS(/iphone|ipad|ipod/.test(window.navigator.userAgent.toLowerCase()));

    const unsubscribe = subscribeInstallAvailability(setIsInstallable);

    const handleAppInstalled = () => setIsInstalled(true);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      unsubscribe();
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const install = async () => {
    const accepted = await promptInstall();
    if (accepted) setIsInstalled(true);
    return accepted;
  };

  return {
    isInstallable,
    isInstalled,
    isIOS,
    install,
  };
}

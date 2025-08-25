import { useEffect, useState, useCallback } from 'react';

interface PWAState {
  isInstalled: boolean;
  isOnline: boolean;
  canInstall: boolean;
  deferredPrompt: any;
}

export const usePWA = () => {
  const [pwaState, setPwaState] = useState<PWAState>({
    isInstalled: false,
    isOnline: navigator.onLine,
    canInstall: false,
    deferredPrompt: null,
  });

  const [swRegistration, setSwRegistration] = useState<ServiceWorkerRegistration | null>(null);

  // Check if app is installed
  const checkIfInstalled = useCallback(() => {
    if (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) {
      setPwaState(prev => ({ ...prev, isInstalled: true }));
    }
  }, []);

  // Handle online/offline status
  const handleOnlineStatus = useCallback(() => {
    setPwaState(prev => ({ ...prev, isOnline: navigator.onLine }));
  }, []);

  // Handle beforeinstallprompt event
  const handleBeforeInstallPrompt = useCallback((e: Event) => {
    e.preventDefault();
    setPwaState(prev => ({ 
      ...prev, 
      canInstall: true, 
      deferredPrompt: e 
    }));
  }, []);

  // Install PWA
  const installPWA = useCallback(async () => {
    if (pwaState.deferredPrompt) {
      pwaState.deferredPrompt.prompt();
      const { outcome } = await pwaState.deferredPrompt.userChoice;
      
      if (outcome === 'accepted') {
        setPwaState(prev => ({ 
          ...prev, 
          canInstall: false, 
          deferredPrompt: null,
          isInstalled: true 
        }));
      }
    }
  }, [pwaState.deferredPrompt]);

  // Register service worker
  const registerServiceWorker = useCallback(async () => {
    if ('serviceWorker' in navigator) {
      try {
        const registration = await navigator.serviceWorker.register('/sw.js');
        setSwRegistration(registration);
        
        // Handle service worker updates
        registration.addEventListener('updatefound', () => {
          const newWorker = registration.installing;
          if (newWorker) {
            newWorker.addEventListener('statechange', () => {
              if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                // New service worker available
                console.log('New service worker available');
              }
            });
          }
        });

        // Handle service worker messages
        navigator.serviceWorker.addEventListener('message', (event) => {
          if (event.data.type === 'MUSIC_ACTION') {
            // Handle music actions from service worker
            handleMusicAction(event.data.action);
          }
        });

        console.log('Service Worker registered successfully');
      } catch (error) {
        console.error('Service Worker registration failed:', error);
      }
    }
  }, []);

  // Handle music actions from service worker
  const handleMusicAction = useCallback((action: string) => {
    // This will be handled by the music player component
    window.dispatchEvent(new CustomEvent('music-action', { detail: { action } }));
  }, []);

  // Request background sync
  const requestBackgroundSync = useCallback(async (tag: string) => {
    // Skip background sync if not supported or service worker not ready
    if (!swRegistration || !('sync' in swRegistration)) {
      console.log('Background sync not supported or service worker not ready');
      return;
    }

    // Validate tag length (Chrome has a limit)
    if (tag.length > 100) {
      console.warn('Background sync tag too long, skipping');
      return;
    }

    try {
      await (swRegistration as any).sync.register(tag);
      console.log('Background sync registered:', tag);
    } catch (error) {
      // Don't throw errors, just log them to prevent app crashes
      console.warn('Background sync registration failed, continuing without sync:', error);
    }
  }, [swRegistration]);

  // Request notification permission
  const requestNotificationPermission = useCallback(async () => {
    console.log('requestNotificationPermission called');
    console.log('Notification API available:', 'Notification' in window);
    console.log('Current permission:', Notification.permission);
    
    if ('Notification' in window) {
      console.log('Requesting notification permission...');
      const permission = await Notification.requestPermission();
      console.log('Permission result:', permission);
      console.log('Permission === granted:', permission === 'granted');
      return permission === 'granted';
    }
    console.log('Notification API not available');
    return false;
  }, []);

  // Show notification
  const showNotification = useCallback((title: string, options?: NotificationOptions) => {
    if ('Notification' in window && Notification.permission === 'granted') {
      return new Notification(title, options);
    }
    return null;
  }, []);

  // Initialize PWA
  useEffect(() => {
    checkIfInstalled();
    registerServiceWorker();

    // Event listeners
    window.addEventListener('online', handleOnlineStatus);
    window.addEventListener('offline', handleOnlineStatus);
    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    return () => {
      window.removeEventListener('online', handleOnlineStatus);
      window.removeEventListener('offline', handleOnlineStatus);
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, [checkIfInstalled, registerServiceWorker, handleOnlineStatus, handleBeforeInstallPrompt]);

  return {
    ...pwaState,
    installPWA,
    requestBackgroundSync,
    requestNotificationPermission,
    showNotification,
    swRegistration,
  };
};

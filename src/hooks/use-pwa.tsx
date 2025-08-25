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
        // Check if we're on mobile
        const isMobile = /mobile|android|iphone|ipad|ipod|blackberry|windows phone/i.test(navigator.userAgent);
        
        if (isMobile) {
          console.log('Registering service worker on mobile device');
          // On mobile, delay service worker registration to prevent interference with media playback
          setTimeout(async () => {
            try {
              const registration = await navigator.serviceWorker.register('/sw.js');
              setSwRegistration(registration);
              console.log('Service Worker registered successfully on mobile');
              setupServiceWorkerHandlers(registration);
            } catch (error) {
              console.error('Service Worker registration failed on mobile:', error);
            }
          }, 1000); // 1 second delay on mobile
        } else {
          // On desktop, register immediately
          const registration = await navigator.serviceWorker.register('/sw.js');
          setSwRegistration(registration);
          console.log('Service Worker registered successfully on desktop');
          setupServiceWorkerHandlers(registration);
        }
      } catch (error) {
        console.error('Service Worker registration failed:', error);
      }
    }
  }, []);

  // Setup service worker event handlers
  const setupServiceWorkerHandlers = useCallback((registration: ServiceWorkerRegistration) => {
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
  }, []);

  // Handle music actions from service worker
  const handleMusicAction = useCallback((action: string) => {
    // This will be handled by the music player component
    window.dispatchEvent(new CustomEvent('music-action', { detail: { action } }));
  }, []);

  // Request background sync
  const requestBackgroundSync = useCallback(async (tag: string) => {
    if (swRegistration && 'sync' in swRegistration) {
      try {
        await swRegistration.sync.register(tag);
        console.log('Background sync registered:', tag);
      } catch (error) {
        console.error('Background sync registration failed:', error);
      }
    }
  }, [swRegistration]);

  // Request notification permission
  const requestNotificationPermission = useCallback(async () => {
    if ('Notification' in window) {
      try {
        // Check if we're on mobile
        const isMobile = /mobile|android|iphone|ipad|ipod|blackberry|windows phone/i.test(navigator.userAgent);
        
        if (isMobile) {
          console.log('Requesting notification permission on mobile device');
          // On mobile, we need to be more careful about when we request permissions
          // to avoid interfering with media playback
        }
        
        const permission = await Notification.requestPermission();
        console.log('Notification permission result:', permission);
        return permission === 'granted';
      } catch (error) {
        console.error('Error requesting notification permission:', error);
        return false;
      }
    }
    return false;
  }, []);

  // Show notification with mobile-specific handling
  const showNotification = useCallback((title: string, options?: NotificationOptions) => {
    if ('Notification' in window && Notification.permission === 'granted') {
      try {
        // Check if we're on mobile
        const isMobile = /mobile|android|iphone|ipad|ipod|blackberry|windows phone/i.test(navigator.userAgent);
        
        if (isMobile) {
          // On mobile, ensure notification doesn't interfere with media playback
          console.log('Showing notification on mobile device:', title);
          
          // Use more mobile-friendly notification options
          const mobileOptions = {
            ...options,
            requireInteraction: false, // Don't require interaction on mobile
            silent: true, // Always silent on mobile to avoid audio conflicts
            tag: options?.tag || 'music-player', // Ensure proper tagging
          };
          
          return new Notification(title, mobileOptions);
        } else {
          // Desktop notification handling
          return new Notification(title, options);
        }
      } catch (error) {
        console.error('Error showing notification:', error);
        return null;
      }
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

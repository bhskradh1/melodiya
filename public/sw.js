const CACHE_NAME = 'melodiya-v1';
const urlsToCache = [
  '/',
  '/index.html',
  '/manifest.json',
  '/src/main.tsx',
  '/src/App.tsx',
  '/src/index.css',
  '/src/App.css'
];

// Install event - cache resources
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('Opened cache');
        return cache.addAll(urlsToCache);
      })
  );
});

// Fetch event - serve from cache when offline
self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request)
      .then((response) => {
        // Return cached version or fetch from network
        return response || fetch(event.request);
      })
  );
});

// Background sync for audio
self.addEventListener('sync', (event) => {
  if (event.tag === 'background-audio-sync') {
    event.waitUntil(handleBackgroundAudioSync());
  }
});

// Handle background audio sync
async function handleBackgroundAudioSync() {
  try {
    // Send message to main thread about background sync
    const clients = await self.clients.matchAll();
    clients.forEach((client) => {
      client.postMessage({
        type: 'BACKGROUND_AUDIO_SYNC',
        timestamp: Date.now()
      });
    });
  } catch (error) {
    console.error('Background audio sync failed:', error);
  }
}

// Handle push notifications for music controls
self.addEventListener('push', (event) => {
  const options = {
    body: event.data ? event.data.text() : 'New music available!',
    icon: '/icon-192x192.png',
    badge: '/icon-192x192.png',
    vibrate: [100, 50, 100],
    data: {
      dateOfArrival: Date.now(),
      primaryKey: 1
    },
    actions: [
      {
        action: 'play',
        title: 'Play',
        icon: '/icon-192x192.png'
      },
      {
        action: 'pause',
        title: 'Pause',
        icon: '/icon-192x192.png'
      },
      {
        action: 'next',
        title: 'Next',
        icon: '/icon-192x192.png'
      }
    ]
  };

  event.waitUntil(
    self.registration.showNotification('Melodiya', options)
  );
});

// Handle notification clicks
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  if (event.action === 'play') {
    // Handle play action
    handleMusicAction('play');
  } else if (event.action === 'pause') {
    // Handle pause action
    handleMusicAction('pause');
  } else if (event.action === 'next') {
    // Handle next action
    handleMusicAction('next');
  } else {
    // Default action - open app
    event.waitUntil(
      clients.openWindow('/')
    );
  }
});

// Handle music actions from notifications
async function handleMusicAction(action) {
  try {
    const clients = await self.clients.matchAll();
    clients.forEach((client) => {
      client.postMessage({
        type: 'MUSIC_ACTION',
        action: action,
        timestamp: Date.now()
      });
    });
  } catch (error) {
    console.error('Music action failed:', error);
  }
}

// Handle messages from main thread
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  
  if (event.data && event.data.type === 'BACKGROUND_AUDIO_REQUEST') {
    // Handle background audio requests
    handleBackgroundAudioRequest(event.data);
  }
});

// Handle background audio requests
async function handleBackgroundAudioRequest(data) {
  try {
    // Keep service worker alive for background audio
    const clients = await self.clients.matchAll();
    clients.forEach((client) => {
      client.postMessage({
        type: 'BACKGROUND_AUDIO_RESPONSE',
        data: data,
        timestamp: Date.now()
      });
    });
  } catch (error) {
    console.error('Background audio request failed:', error);
  }
}

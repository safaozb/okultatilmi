importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging-compat.js');

const CACHE_NAME = 'tatilmi-cache-v1';
const urlsToCache = [
    './',
    './index.html',
    './css/style.css',
    './js/app.js',
    './js/config.js',
    './img/favicon.png',
    './img/banner.png'
];

// Kurulum aşamasında temel dosyaları önbelleğe al
self.addEventListener('install', event => {
    self.skipWaiting(); // Yeni versiyonu anında devreye sok
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => cache.addAll(urlsToCache))
    );
});

// Aktifleştiğinde kontrolü hemen ele al
self.addEventListener('activate', event => {
    event.waitUntil(self.clients.claim());
});

// İstek yakalama (Network First, Fallback to Cache stratejisi)
self.addEventListener('fetch', event => {
    if (event.request.method !== 'GET') return;

    event.respondWith(
        fetch(event.request)
            .then(response => {
                // Başarılı yanıtları önbelleğe kopyala (Gelecekteki çevrimdışı durumlar için)
                if (response && response.status === 200 && response.type === 'basic') {
                    const responseToCache = response.clone();
                    caches.open(CACHE_NAME).then(cache => cache.put(event.request, responseToCache));
                }
                return response;
            })
            .catch(() => {
                return caches.match(event.request);
            })
    );
});

// --- FIREBASE PUSH NOTIFICATION (Arka Plan Bildirimleri) ---
// DİKKAT: Aşağıdaki ayarları kendi config.js dosyanızdaki bilgilerle güncelleyin!
firebase.initializeApp({
  apiKey: "API_ANAHTARINIZ_BURAYA",
  authDomain: "PROJE_ID.firebaseapp.com",
  projectId: "PROJE_ID",
  storageBucket: "PROJE_ID.firebasestorage.app",
  messagingSenderId: "SENDER_ID",
  appId: "APP_ID"
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage(function(payload) {
  const notificationTitle = payload.notification.title || "Yeni Tatil Duyurusu!";
  const notificationOptions = {
    body: payload.notification.body,
    icon: './img/favicon.png'
  };
  return self.registration.showNotification(notificationTitle, notificationOptions);
});
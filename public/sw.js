importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging-compat.js');

const CACHE_NAME = 'tatilmi-cache-v2';
const urlsToCache = [
    '/',
    '/index.html',
    '/css/style.css',
    '/js/app.js',
    '/js/config.js',
    '/img/favicon.png',
    '/img/banner.png'
];

// Kurulum aşamasında temel dosyaları önbelleğe al
self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => cache.addAll(urlsToCache))
    );
});

// Aktifleştiğinde kontrolü hemen ele al
self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames.map(cacheName => {
                    // Mevcut CACHE_NAME ile eşleşmeyen tüm eski önbellekleri sil
                    if (cacheName !== CACHE_NAME) {
                        return caches.delete(cacheName);
                    }
                })
            );
        }).then(() => self.clients.claim())
    );
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

// Kullanıcıdan "Yenile" onayı geldiğinde beklemeyi atla ve yeni sürüme geç
self.addEventListener('message', event => {
    if (event.data && event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
});

// --- FIREBASE PUSH NOTIFICATION (Arka Plan Bildirimleri) ---
// Firebase ayarlarını app.js üzerinden URL parametresi ile dinamik olarak çekiyoruz
const urlParams = new URLSearchParams(location.search);
const dynamicFirebaseConfig = Object.fromEntries(urlParams.entries());

if (dynamicFirebaseConfig && dynamicFirebaseConfig.apiKey) {
    firebase.initializeApp(dynamicFirebaseConfig);
    const messaging = firebase.messaging();

    messaging.onBackgroundMessage(function(payload) {
        const notificationTitle = payload.notification.title || "Yeni Tatil Duyurusu!";
        const notificationOptions = {
            body: payload.notification.body,
            icon: '/img/favicon.png'
        };
        return self.registration.showNotification(notificationTitle, notificationOptions);
    });
}
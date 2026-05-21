importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging-compat.js');

// Kurulum aşamasında beklemeden hemen aktif ol
self.addEventListener('install', event => {
    self.skipWaiting();
});

// Aktifleştiğinde (Kullanıcı siteye girdiğinde) tüm eski önbellekleri (Cache) sil
self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames.map(cacheName => caches.delete(cacheName))
            );
        }).then(() => self.clients.claim())
    );
});

// Fetch olayında cache kullanma, istekleri doğrudan ağa bırak
self.addEventListener('fetch', event => {
    // Önbellek iptal edildi
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
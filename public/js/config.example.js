// Uygulamanın genel yapılandırma (config) bilgileri - ÖRNEK ŞABLON
// NOT: Bu dosyayı kopyalayıp adını "config.js" yapın ve kendi Firebase bilgilerinizi girin.
export const firebaseConfig = {
  apiKey: "API_ANAHTARINIZ_BURAYA",
  authDomain: "PROJE_ID.firebaseapp.com",
  projectId: "PROJE_ID",
  storageBucket: "PROJE_ID.firebasestorage.app",
  messagingSenderId: "SENDER_ID",
  appId: "APP_ID",
  measurementId: "G-MEASUREMENT_ID",
  vapidKey: "WEB_PUSH_VAPID_ANAHTARINIZ_BURAYA_GELECEK"
};

// MEB Okul Tatilleri (Milli Eğitim Bakanlığı verileri her yıl değiştiği için manuel eklenir)
export const initialHolidays = [
    { name: "Sömestr Tatili", start: "2026-01-19", end: "2026-01-30", duration: "14 Gün", type: "meb" },
    { name: "2. Ara Tatil", start: "2026-03-16", end: "2026-03-20", duration: "9 Gün", type: "meb" },
    { name: "Ramazan Bayramı", start: "2026-03-19", end: "2026-03-22", duration: "3.5 Gün", type: "public" },
    { name: "Kurban Bayramı", start: "2026-05-26", end: "2026-05-30", duration: "4.5 Gün", type: "public" },
    { name: "Yaz Tatili", start: "2026-06-26", end: "2026-09-07", duration: "73 Gün", type: "meb" },
    { name: "1. Ara Tatil", start: "2026-11-16", end: "2026-11-20", duration: "9 Gün", type: "meb" }
];
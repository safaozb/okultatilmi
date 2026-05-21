// Uygulamanın genel yapılandırma (config) bilgileri
export const firebaseConfig = {
  apiKey: "AIzaSyCJld0zo2vsnr86rE0hLeZw-WJr0PEj3II",
  authDomain: "okultatilmii.firebaseapp.com",
  projectId: "okultatilmii",
  storageBucket: "okultatilmii.firebasestorage.app",
  messagingSenderId: "344360216763",
  appId: "1:344360216763:web:cf122cbc2ede02674ee19e",
  measurementId: "G-S1DTEM1SQT",
  vapidKey: "BFEeBCfxNrZ-3aCmGOhiq_RO-NnnvMd462sxgnYH099j4o-uZ7gUmg5e2uWAtntSs-Ok0cMYN17UY73nrBdmoYw"
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
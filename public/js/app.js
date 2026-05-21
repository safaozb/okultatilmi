import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-analytics.js";
import { getMessaging, getToken, onMessage } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging.js";
import { getFirestore, collection, getDocs, doc, setDoc, increment, onSnapshot, query, orderBy } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { firebaseConfig, initialHolidays } from "./config.js";

// Firebase Başlatma (Config eklendiyse çalışır)
const app = firebaseConfig.apiKey ? initializeApp(firebaseConfig) : null;
const db = app ? getFirestore(app) : null;
const analytics = (app && firebaseConfig.measurementId) ? getAnalytics(app) : null;
const messaging = (app && firebaseConfig.vapidKey) ? getMessaging(app) : null;

// Başlangıç tatillerini config'den al (Uygulama çalıştıkça API'den ve veritabanından gelen veriler eklenecek)
let holidays = [...initialHolidays];

// Core Utility Functions
const getStartOfDay = (dateStr) => new Date(`${dateStr}T00:00:00`).getTime();
const getEndOfDay = (dateStr) => new Date(`${dateStr}T23:59:59`).getTime();

const formatDate = (dateStr) => {
    // Haftanın günlerini de (Pazartesi, Salı vb.) gösterecek şekilde güncellendi
    return new Date(dateStr).toLocaleDateString('tr-TR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
};

// Google Takvim linki oluşturucu
const getGoogleCalendarLink = (holiday) => {
    const startStr = holiday.start.replace(/-/g, '');
    const endDate = new Date(holiday.end);
    endDate.setDate(endDate.getDate() + 1); // Bitiş günü hariç tutulduğu için 1 gün ekliyoruz
    const endStr = endDate.toISOString().split('T')[0].replace(/-/g, '');
    return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(holiday.name)}&dates=${startStr}/${endStr}`;
};

// Initialize State
const today = new Date();
const todayTime = today.getTime();
document.getElementById('current-date-display').textContent = today.toLocaleDateString('tr-TR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
document.getElementById('current-year').textContent = today.getFullYear();

let isHoliday = false;
let nextHoliday = null;
let hidePastHolidays = localStorage.getItem('hide-past-holidays') === 'true';

// Takvim Görünümü Durumları
let currentView = localStorage.getItem('calendar-view') || 'list';
let currentMonth = today.getMonth();
let currentYear = today.getFullYear();

// --- Dinamik Paylaşım Linki (WhatsApp) ---
const whatsappBtn = document.getElementById("whatsapp-share-btn");
if (whatsappBtn) {
    const siteUrl = window.location.origin; // Otomatik olarak mevcut site adresini alır (Örn: localhost veya firebase)
    const shareText = encodeURIComponent(`Yarın okullar tatil mi? Buradan bakabilirsin: ${siteUrl}`);
    whatsappBtn.href = `https://api.whatsapp.com/send?text=${shareText}`;
}

// --- HİKAYEDE PAYLAŞ (STORY SHARE) SİSTEMİ ---
const storyShareBtn = document.getElementById('story-share-btn');

if (storyShareBtn) {
    storyShareBtn.addEventListener('click', async () => {
        if (typeof html2canvas === 'undefined') {
            alert("Paylaşım modülü yükleniyor, lütfen sayfayı yenileyip tekrar deneyin.");
            return;
        }

        const originalIcon = storyShareBtn.innerHTML;
        // Yükleniyor animasyonu ekle
        storyShareBtn.innerHTML = '<svg class="animate-spin w-4 h-4 sm:w-5 sm:h-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>';
        storyShareBtn.disabled = true;

        try {
            // Story/Hikaye için özel "Çıkartma (Sticker)" tasarımı oluştur (Ekranda görünmez)
            const captureDiv = document.createElement('div');
            captureDiv.style.position = 'fixed';
            captureDiv.style.top = '-9999px';
            captureDiv.style.left = '-9999px';
            captureDiv.style.zIndex = '-1';
            
            const labelText = document.getElementById('next-holiday-label').innerText || "EN YAKIN TATİLE KALAN SÜRE";
            let countdownText = document.getElementById('countdown').innerText.replace(/\n/g, ' ').trim();
            if (countdownText === "Hesaplanıyor...") countdownText = "Tatil Bekleniyor...";

            captureDiv.innerHTML = `
                <div id="capture-sticker" class="flex flex-col items-center justify-center bg-gradient-to-br from-indigo-600 via-purple-600 to-rose-500 text-white rounded-[2.5rem] p-8 shadow-2xl" style="width: 380px; text-align: center; font-family: ui-sans-serif, system-ui, sans-serif;">
                    <div class="text-5xl mb-4 drop-shadow-md">🎒✨</div>
                    <h2 class="text-lg font-bold uppercase tracking-wider mb-4 opacity-90">${labelText}</h2>
                    <div class="text-3xl font-black drop-shadow-lg bg-white/20 px-6 py-5 rounded-2xl border border-white/30 w-full leading-tight">
                        ${countdownText}
                    </div>
                    <div class="mt-6 font-bold tracking-widest opacity-90 text-sm bg-black/20 px-5 py-2 rounded-full">
                        📍 okultatilmi.com
                    </div>
                </div>
            `;
            document.body.appendChild(captureDiv);

            // DOM'un tam olarak render edilmesi için milisaniyelik bir bekleme
            await new Promise(res => setTimeout(res, 100));

            const canvas = await html2canvas(document.getElementById('capture-sticker'), {
                scale: 3, // Instagram için yüksek çözünürlük
                backgroundColor: null,
                useCORS: true
            });

            document.body.removeChild(captureDiv);

            canvas.toBlob(async (blob) => {
                const file = new File([blob], "tatilmi-hikaye.png", { type: "image/png" });

                // Web Share API destekleniyorsa (Android/iOS) doğrudan yerel paylaşım menüsünü aç
                if (navigator.canShare && navigator.canShare({ files: [file] })) {
                    try {
                        await navigator.share({
                            title: 'Okul Tatil Mi?',
                            text: 'En yakın tatile kalan süre! 🎒✨\n👉 okultatilmi.com',
                            files: [file]
                        });
                    } catch (err) {
                        console.log('Paylaşım menüsü kapatıldı veya hata oluştu.', err);
                    }
                } else {
                    // Web Share API desteklenmiyorsa (Örn: Masaüstü cihazlar) dosyayı doğrudan cihaza indir
                    const link = document.createElement('a');
                    link.download = 'tatilmi-hikaye.png';
                    link.href = canvas.toDataURL('image/png');
                    link.click();
                    alert("Görsel cihazınıza indirildi! İstediğiniz platformda hikaye olarak paylaşabilirsiniz.");
                }
            }, 'image/png');

        } catch (error) {
            console.error("Görsel oluşturulurken hata:", error);
            alert("Görsel oluşturulamadı, lütfen tekrar deneyin.");
        } finally {
            storyShareBtn.innerHTML = originalIcon;
            storyShareBtn.disabled = false;
        }
    });
}

// Şehir Filtreleme Kurulumu
const citiesList = ["Adana", "Adıyaman", "Afyonkarahisar", "Ağrı", "Amasya", "Ankara", "Antalya", "Artvin", "Aydın", "Balıkesir", "Bilecik", "Bingöl", "Bitlis", "Bolu", "Burdur", "Bursa", "Çanakkale", "Çankırı", "Çorum", "Denizli", "Diyarbakır", "Edirne", "Elazığ", "Erzincan", "Erzurum", "Eskişehir", "Gaziantep", "Giresun", "Gümüşhane", "Hakkâri", "Hatay", "Isparta", "Mersin", "İstanbul", "İzmir", "Kars", "Kastamonu", "Kayseri", "Kırklareli", "Kırşehir", "Kocaeli", "Konya", "Kütahya", "Malatya", "Manisa", "Kahramanmaraş", "Mardin", "Muğla", "Muş", "Nevşehir", "Niğde", "Ordu", "Rize", "Sakarya", "Samsun", "Siirt", "Sinop", "Sivas", "Tekirdağ", "Tokat", "Trabzon", "Tunceli", "Şanlıurfa", "Uşak", "Van", "Yozgat", "Zonguldak", "Aksaray", "Bayburt", "Karaman", "Kırıkkale", "Batman", "Şırnak", "Bartın", "Ardahan", "Iğdır", "Yalova", "Karabük", "Kilis", "Osmaniye", "Düzce"];
let selectedCity = localStorage.getItem('selected-city') || 'all';

// --- FCM TOKEN ŞEHİR GÜNCELLEMESİ YARDIMCI FONKSİYON ---
async function updateFCMTokenCity(city) {
    if (!messaging || Notification.permission !== 'granted') return;
    try {
        const token = await getToken(messaging, { vapidKey: firebaseConfig.vapidKey });
        if (token) await setDoc(doc(db, 'fcm_tokens', token), { city: city }, { merge: true });
    } catch(e) { console.log("Token şehir güncellemesi yapılamadı:", e); }
}

const cityFilterContainer = document.getElementById("city-dropdown-container");
const cityFilterBtn = document.getElementById("city-dropdown-btn");
const cityFilterText = document.getElementById("city-dropdown-text");
const cityFilterMenu = document.getElementById("city-dropdown-menu");
const cityFilterSearch = document.getElementById("city-dropdown-search");
const cityFilterList = document.getElementById("city-dropdown-list");

if (cityFilterContainer) {
    const options = [{ value: 'all', label: '🌍 Tüm Şehirler' }, ...citiesList.map(c => ({ value: c, label: c }))];
    
    const renderDropdownOptions = (searchTerm = "") => {
        cityFilterList.innerHTML = "";
        const filtered = options.filter(opt => opt.label.toLowerCase().includes(searchTerm.toLowerCase()));
        
        if (filtered.length === 0) {
            cityFilterList.innerHTML = `<li class="px-3 py-2 text-slate-500 dark:text-slate-400 text-center">Sonuç bulunamadı</li>`;
            return;
        }

            const fragment = document.createDocumentFragment();
        filtered.forEach(opt => {
            const li = document.createElement('li');
            li.className = `px-3 py-2 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 transition-colors ${selectedCity === opt.value ? 'bg-slate-100 dark:bg-slate-700 font-bold text-slate-900 dark:text-white' : ''}`;
            li.textContent = opt.label;
                li.dataset.value = opt.value;
                li.dataset.label = opt.label;
                fragment.appendChild(li);
        });
            cityFilterList.appendChild(fragment);
    };

    const closeDropdown = () => {
        cityFilterMenu.classList.add('opacity-0', '-translate-y-2');
        setTimeout(() => {
            cityFilterMenu.classList.add('hidden');
            cityFilterMenu.classList.remove('flex');
        }, 150);
    };

    const openDropdown = () => {
        cityFilterSearch.value = "";
        renderDropdownOptions();
        cityFilterMenu.classList.remove('hidden');
        cityFilterMenu.classList.add('flex');
        requestAnimationFrame(() => {
            cityFilterMenu.classList.remove('opacity-0', '-translate-y-2');
            cityFilterSearch.focus();
        });
    };

    cityFilterBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (cityFilterMenu.classList.contains('hidden')) openDropdown();
        else closeDropdown();
    });

    // Bellek tasarrufu için her li elementi yerine ana listeye tıklama olayı (Event Delegation)
    cityFilterList.addEventListener('click', (e) => {
        const li = e.target.closest('li[data-value]');
        if (!li) return;
        
        selectedCity = li.dataset.value;
        localStorage.setItem('selected-city', selectedCity);
        cityFilterText.textContent = li.dataset.label;
        closeDropdown();
        updateDOM();
        updateFCMTokenCity(selectedCity);
    });

    let searchTimeout;
    cityFilterSearch.addEventListener('input', (e) => {
        const val = e.target.value; // Tarayıcı çökmelerine karşı değeri asenkron işlemden önce sabitliyoruz
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(() => {
            renderDropdownOptions(val);
        }, 150);
    });

    document.addEventListener('click', (e) => {
        if (!cityFilterContainer.contains(e.target)) closeDropdown();
    });

    // Başlangıç değerini ayarla
    const initialOpt = options.find(o => o.value === selectedCity) || options[0];
    cityFilterText.textContent = initialOpt.label;
}

// --- OTOMATİK KONUM BULMA (GEOLOCATION) ---
const geoLocationBtn = document.getElementById("geo-location-btn");
if (geoLocationBtn) {
    geoLocationBtn.addEventListener('click', () => {
        if (!navigator.geolocation) {
            alert("Tarayıcınız konum tespitini desteklemiyor.");
            return;
        }

        const originalIcon = geoLocationBtn.innerHTML;
        // Yükleniyor ikonu (Spinner)
        geoLocationBtn.innerHTML = '<svg class="animate-spin w-5 h-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>';
        geoLocationBtn.disabled = true;

        navigator.geolocation.getCurrentPosition(async (position) => {
            const lat = position.coords.latitude;
            const lon = position.coords.longitude;

            try {
                // Ücretsiz ve key gerektirmeyen BigDataCloud Reverse Geocoding API
                const response = await fetch(`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lon}&localityLanguage=tr`);
                const data = await response.json();
                
                // Türkçe karakter dönüştürme ve eşleştirme
                const normalizeTr = (text) => text.replace(/İ/g, 'i').replace(/I/g, 'ı').toLowerCase();
                const detectedName = normalizeTr(data.city || data.principalSubdivision || data.locality || "");
                
                const matchedCity = citiesList.find(c => {
                    const listName = normalizeTr(c);
                    return detectedName.includes(listName) || listName.includes(detectedName);
                });

                if (matchedCity) {
                    selectedCity = matchedCity;
                    localStorage.setItem('selected-city', selectedCity);
                    if (cityFilterText) cityFilterText.textContent = matchedCity;
                    updateDOM();
                    updateFCMTokenCity(selectedCity);
                } else {
                    alert("Konumunuza en uygun şehir listede bulunamadı.");
                }
            } catch (error) {
                console.error("Konum servisi hatası:", error);
                alert("Konum bilgileri alınırken bir hata oluştu.");
            } finally {
                geoLocationBtn.innerHTML = originalIcon;
                geoLocationBtn.disabled = false;
            }
        }, (error) => {
            console.error("Konum izni hatası:", error);
            alert("Lütfen tarayıcı ayarlarından konum erişimine izin verin.");
            geoLocationBtn.innerHTML = originalIcon;
            geoLocationBtn.disabled = false;
        });
    });
}

// Countdown Logic
function updateCountdown() {
    const labelEl = document.getElementById('next-holiday-label');
    if (!nextHoliday) {
        document.getElementById('countdown').innerHTML = "<span class='text-slate-500 dark:text-slate-400 text-base'>Yaklaşan tatil bulunmamaktadır.</span>";
        if (labelEl) labelEl.textContent = "Tatiller Bitti";
        return;
    }

    if (labelEl) {
        labelEl.textContent = `Yaklaşan: ${nextHoliday.name}`;
    }

    const targetTime = getStartOfDay(nextHoliday.start);
    const now = new Date().getTime();
    const diff = targetTime - now;

    if (diff <= 0) {
        location.reload(); // Reload page when holiday starts
        return;
    }

    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

    document.getElementById('countdown').innerHTML = 
        `<span class="font-bold text-slate-900 dark:text-white">${days}</span> Gün 
         <span class="font-bold text-slate-900 dark:text-white">${hours}</span> Saat 
         <span class="font-bold text-slate-900 dark:text-white">${minutes}</span> Dakika`;
}

// --- DİNAMİK HAVA DURUMU ANİMASYONU ---
function updateHeroWeather(code) {
    const bgEl = document.getElementById('hero-weather-bg');
    const animContainer = document.getElementById('weather-animation-container');
    if (!bgEl || !animContainer) return;

    animContainer.innerHTML = '';

    // Şehir seçimi "Tüm Şehirler" ise veya hata varsa varsayılan resme dön
    if (code === -1) {
        animContainer.innerHTML = '<img src="/img/banner.png" alt="Bugün Okul Tatil Mi?" class="w-full h-full object-cover opacity-90" fetchpriority="high" decoding="sync">';
        bgEl.className = 'absolute inset-0 w-full h-full transition-colors duration-1000';
        return;
    }

    let type = 'sun';
    let bgColorClass = 'bg-slate-100 dark:bg-slate-800';

    // Hava Durumu Kodunu Sınıflandır
    if ([1, 2, 3].includes(code)) {
        type = 'cloud';
        bgColorClass = 'bg-slate-200 dark:bg-slate-700';
    } else if ([45, 48].includes(code)) {
        type = 'fog';
        bgColorClass = 'bg-slate-200 dark:bg-slate-700';
    } else if ([51, 53, 55, 56, 57, 61, 63, 65, 80, 81, 82].includes(code)) {
        type = 'rain';
        bgColorClass = 'bg-slate-300 dark:bg-slate-900';
    } else if ([71, 73, 75, 77, 85, 86].includes(code)) {
        type = 'snow';
        bgColorClass = 'bg-slate-200 dark:bg-slate-800';
    } else if ([95, 96, 99].includes(code)) {
        type = 'storm';
        bgColorClass = 'bg-slate-700 dark:bg-slate-950';
    }

    // Arka plan rengini hava durumuna göre güncelle
    bgEl.className = `absolute inset-0 w-full h-full transition-colors duration-1000 ${bgColorClass}`;

    // Doğal bir görünüm için elementleri farklı konumlar ve hızlarda üret
    if (type === 'sun') {
        animContainer.innerHTML = '<div class="weather-sun"></div>';
    } else if (type === 'cloud' || type === 'fog') {
        for (let i = 0; i < 6; i++) {
            const size = Math.random() * 60 + 40;
            const top = Math.random() * 40 + 5;
            const duration = Math.random() * 15 + 15;
            const delay = Math.random() * -20;
            animContainer.innerHTML += `<div class="weather-cloud" style="width:${size}px; height:${size/3}px; top:${top}%; animation-duration:${duration}s; animation-delay:${delay}s;"></div>`;
        }
    } else if (type === 'rain' || type === 'storm') {
        for (let i = 0; i < 40; i++) {
            const left = Math.random() * 100;
            const duration = Math.random() * 0.5 + 0.5;
            const delay = Math.random() * -2;
            let extraStyle = '';
            if (type === 'storm' && Math.random() > 0.9) {
                extraStyle = 'background-color: #fde047; width: 3px;'; // Fırtınada sarı ince çizgiler (mini şimşek hissi)
            }
            animContainer.innerHTML += `<div class="weather-rain" style="left:${left}%; animation-duration:${duration}s; animation-delay:${delay}s; ${extraStyle}"></div>`;
        }
        if (type === 'storm') {
            animContainer.innerHTML += '<div class="weather-lightning"></div>'; // Gökyüzü flaşı (Şimşek çakması)
        }
    } else if (type === 'snow') {
        for (let i = 0; i < 50; i++) {
            const size = Math.random() * 4 + 2;
            const left = Math.random() * 100;
            const duration = Math.random() * 3 + 2;
            const delay = Math.random() * -5;
            animContainer.innerHTML += `<div class="weather-snow" style="width:${size}px; height:${size}px; left:${left}%; animation-duration:${duration}s; animation-delay:${delay}s;"></div>`;
        }
    }
}

// --- HAVA DURUMU (OPEN-METEO API) ---
function getWeatherInfo(code) {
    if (code === 0) return { text: 'Açık / Güneşli', emoji: '☀️', isBad: false };
    if ([1, 2].includes(code)) return { text: 'Parçalı Bulutlu', emoji: '⛅', isBad: false };
    if (code === 3) return { text: 'Çok Bulutlu', emoji: '☁️', isBad: false };
    if ([45, 48].includes(code)) return { text: 'Sisli', emoji: '🌫️', isBad: false };
    if ([51, 53, 55, 56, 57].includes(code)) return { text: 'Çisenti', emoji: '🌦️', isBad: false };
    if ([61, 63, 65, 80, 81, 82].includes(code)) return { text: 'Yağmurlu', emoji: '🌧️', isBad: false };
    if ([71, 73, 75, 77, 85, 86].includes(code)) return { text: 'Kar Yağışlı', emoji: '❄️', isBad: true };
    if ([95, 96, 99].includes(code)) return { text: 'Fırtınalı', emoji: '⛈️', isBad: true };
    return { text: 'Bilinmiyor', emoji: '🌍', isBad: false };
}

async function loadWeatherForCity(city) {
    const container = document.getElementById("weather-banner-container");
    if (!container) return;

    if (city === 'all' || city === 'genel') {
        container.classList.add('hidden');
        updateHeroWeather(-1); // Resme Dön
        return;
    }

    container.classList.remove('hidden');
    document.getElementById('weather-city-name').textContent = city;
    document.getElementById('weather-desc').innerHTML = "Yükleniyor...";
    document.getElementById('weather-temp').textContent = "--°C";
    document.getElementById('weather-emoji').textContent = "⏳";
    
    try {
        const geoRes = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=tr&format=json`);
        const geoData = await geoRes.json();
        
        if (!geoData.results || geoData.results.length === 0) throw new Error("Konum bulunamadı");
        const { latitude, longitude } = geoData.results[0];

        const weatherRes = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,weather_code`);
        const weatherData = await weatherRes.json();

        const temp = Math.round(weatherData.current.temperature_2m);
        const code = weatherData.current.weather_code;

        const weatherInfo = getWeatherInfo(code);

        document.getElementById('weather-temp').textContent = `${temp}°C`;
        document.getElementById('weather-emoji').textContent = weatherInfo.emoji;

        const alertHtml = weatherInfo.isBad 
            ? `<span class="mt-0.5 inline-block bg-rose-100 dark:bg-rose-900/40 text-rose-600 dark:text-rose-400 text-[10px] px-1.5 py-0.5 rounded font-bold border border-rose-200 dark:border-rose-800/50">⚠️ Olumsuz Hava - Tatil İhtimali</span>` 
            : '';
        document.getElementById('weather-desc').innerHTML = `<span>${weatherInfo.text}</span>${alertHtml}`;

        updateHeroWeather(code); // Animasyonu Başlat

        // Tatil İhtimali Algoritması
        const probContainer = document.getElementById("holiday-probability-container");
        const probBar = document.getElementById("prob-bar");
        const probPercentage = document.getElementById("prob-percentage");
        const probText = document.getElementById("prob-text");

        if (probContainer && probBar && probPercentage && probText) {
            probContainer.classList.remove('hidden');
            let probability = 0;
            let probMessage = "Hava şartları eğitim için elverişli.";
            let barColorClass = "bg-slate-400 dark:bg-slate-500";
            let textColorClass = "text-slate-600 dark:text-slate-400";

            if ([71, 73, 75, 77, 85, 86].includes(code)) { // Kar Yağışlı
                if (temp <= -2) {
                    probability = 85 + Math.floor(Math.random() * 10);
                    probMessage = "Yoğun kar ve don! Tatil ihtimali çok yüksek.";
                    barColorClass = "bg-emerald-500"; textColorClass = "text-emerald-600 dark:text-emerald-400";
                } else if (temp <= 2) {
                    probability = 60 + Math.floor(Math.random() * 15);
                    probMessage = "Kar yağışlı. Valilik açıklaması beklenebilir.";
                    barColorClass = "bg-amber-500"; textColorClass = "text-amber-600 dark:text-amber-400";
                } else {
                    probability = 30 + Math.floor(Math.random() * 10);
                    probMessage = "Karla karışık yağmur. Tatil için yeterli olmayabilir.";
                    barColorClass = "bg-indigo-500"; textColorClass = "text-indigo-600 dark:text-indigo-400";
                }
            } else if ([95, 96, 99].includes(code)) { // Fırtına
                probability = 45 + Math.floor(Math.random() * 15);
                probMessage = "Şiddetli fırtına uyarısı! Tedbir amaçlı tatil olabilir.";
                barColorClass = "bg-rose-500"; textColorClass = "text-rose-600 dark:text-rose-400";
            } else if ([61, 63, 65, 80, 81, 82].includes(code) && temp <= 3) { // Soğuk Yağmur
                probability = 15 + Math.floor(Math.random() * 10);
                probMessage = "Soğuk ve yağmurlu. Gizli buzlanma riski takip edilmeli.";
                barColorClass = "bg-indigo-400"; textColorClass = "text-indigo-500 dark:text-indigo-400";
            } else {
                probability = Math.floor(Math.random() * 5); // %0-4 arası
            }

            probBar.className = `h-full rounded-full w-0 transition-all duration-1000 ease-out ${barColorClass}`;
            probPercentage.className = `text-sm font-black transition-colors duration-500 ${textColorClass}`;
            
            // DOM update
            setTimeout(() => { probBar.style.width = `${probability}%`; }, 100);
            probPercentage.textContent = `%${probability}`;
            probText.textContent = probMessage;
        }

    } catch (error) {
        document.getElementById('weather-desc').innerHTML = "<span>Hava durumu alınamadı.</span>";
        document.getElementById('weather-emoji').textContent = "❌";
        updateHeroWeather(-1);
        const probCont = document.getElementById("holiday-probability-container");
        if (probCont) probCont.classList.add("hidden");
    }
}

function updateDOM() {
    const scheduleContainer = document.getElementById('holiday-schedule');
    scheduleContainer.innerHTML = "";

    // Hesaplama state'ini sıfırla
    isHoliday = false;
    nextHoliday = null;
    let displayedCount = 0;

    // Seçili şehre veya tüm Türkiye'ye (genel) ait tatilleri filtrele
    const filteredHolidays = holidays.filter(h => selectedCity === 'all' || !h.city || h.city === 'genel' || h.city === selectedCity);

    filteredHolidays.forEach((holiday, index) => {
        const start = getStartOfDay(holiday.start);
        const end = getEndOfDay(holiday.end);
        const isPast = end < todayTime;

        const isCancelled = holiday.status === 'cancelled';
        const isPostponed = holiday.status === 'postponed';

        if (!isCancelled) {
            if (todayTime >= start && todayTime <= end) isHoliday = true;
            if (start > todayTime && (!nextHoliday || start < getStartOfDay(nextHoliday.start))) nextHoliday = holiday;
        }

        // Eğer "Geçmişi Gizle" seçiliyse ve tatil bittiyse kartı çizmeden geç
        if (hidePastHolidays && isPast) return;
        displayedCount++;

        // Daha modern etkileşimli kart sınıfları ve sırayla geliş animasyonu
        const interactionClass = isPast 
            ? "opacity-60 grayscale bg-slate-50 dark:bg-slate-900/50 border border-transparent" 
            : "bg-white dark:bg-slate-800 hover:-translate-y-1 hover:shadow-md border border-slate-200 dark:border-slate-700 cursor-default";
        const dateRange = start === end ? formatDate(holiday.start) : `${formatDate(holiday.start)} - ${formatDate(holiday.end)}`;

        // Takvim yaprağı görünümü için tarihi ayrıştırıyoruz (Sol taraftaki ikonik takvim için)
        const startLeaf = new Date(holiday.start);
        const leafMonth = startLeaf.toLocaleDateString('tr-TR', { month: 'short' });
        const leafDay = startLeaf.toLocaleDateString('tr-TR', { day: 'numeric' });
        const leafWeekday = startLeaf.toLocaleDateString('tr-TR', { weekday: 'short' });

        // Türüne Göre Renklendirme ve Etiketler
        const isMeb = holiday.type === 'meb';
        let leafBgClass = 'bg-slate-100 dark:bg-slate-700 border-slate-200 dark:border-slate-600';
        let leafTextClass = 'text-slate-700 dark:text-slate-200';
        const badgeClass = 'bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-600';
        
        if (isCancelled) {
            leafBgClass = 'bg-rose-50 dark:bg-rose-900/20 border-rose-200 dark:border-rose-800/50 opacity-80';
            leafTextClass = 'text-rose-700 dark:text-rose-400 line-through';
        } else if (isPostponed) {
            leafBgClass = 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800/50';
            leafTextClass = 'text-amber-700 dark:text-amber-400';
        }

        const typeLabel = isMeb ? 'Okul Tatili' : 'Resmi Tatil';
        const cityBadge = (holiday.city && holiday.city !== 'genel') ? `<span class="inline-block bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-md px-2 py-0.5 text-xs font-semibold tracking-wide border border-slate-200 dark:border-slate-600">📍 ${holiday.city}</span>` : '';
        const statusBadge = isCancelled ? `<span class="inline-block bg-rose-100 dark:bg-rose-900/40 text-rose-700 dark:text-rose-400 rounded-md px-2 py-0.5 text-xs font-semibold tracking-wide border border-rose-200 dark:border-rose-800/50">❌ İptal Edildi</span>` :
                            isPostponed ? `<span class="inline-block bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400 rounded-md px-2 py-0.5 text-xs font-semibold tracking-wide border border-amber-200 dark:border-amber-800/50">⚠️ Ertelendi</span>` : '';
        const titleClasses = isCancelled ? "line-through opacity-70" : "";
        
        const gCalLink = getGoogleCalendarLink(holiday);

        const cardHTML = `
            <div class="${interactionClass} rounded-2xl p-5 flex items-center gap-4 sm:gap-5 transition-all duration-300 opacity-0 animate-fadeInUp" style="animation-delay: ${index * 100}ms;">
                <!-- Takvim Yaprağı İkonu -->
                <div class="flex flex-col items-center justify-center rounded-xl min-w-[65px] sm:min-w-[80px] h-[75px] sm:h-[90px] border shadow-sm shrink-0 ${leafBgClass}">
                    <span class="text-xs font-bold uppercase tracking-wider ${leafTextClass}">${leafMonth}</span>
                    <span class="text-xl sm:text-2xl font-black text-slate-800 dark:text-slate-100 leading-none my-0.5 ${isCancelled ? 'line-through' : ''}">${leafDay}</span>
                    <span class="text-[10px] font-medium text-slate-500 dark:text-slate-400 uppercase">${leafWeekday}</span>
                </div>
                
                <!-- Tatil Bilgileri -->
                <div class="flex-1 min-w-0">
                    <div class="flex justify-between items-start gap-2">
                        <h3 class="font-bold text-lg text-slate-900 dark:text-white leading-tight mb-1 truncate ${titleClasses}" title="${holiday.name}">${holiday.name}</h3>
                        <a href="${gCalLink}" target="_blank" rel="noopener noreferrer" class="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors shrink-0" title="Google Takvim'e Ekle">
                            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"></path></svg>
                        </a>
                    </div>
                    <p class="text-xs text-slate-500 dark:text-slate-400 mb-2 leading-relaxed line-clamp-2" title="${dateRange}">
                        ${dateRange}
                    </p>
                    <div class="mt-auto flex flex-wrap gap-2">
                        ${statusBadge}
                        <span class="inline-block rounded-md px-2 py-0.5 text-xs font-semibold tracking-wide border ${badgeClass}">${typeLabel}</span>
                        ${cityBadge}
                        <span class="inline-block bg-slate-100 dark:bg-slate-700/50 text-slate-600 dark:text-slate-300 rounded-md px-2 py-0.5 text-xs font-semibold tracking-wide border border-slate-200 dark:border-slate-600">Süre: ${holiday.duration}</span>
                    </div>
                </div>
            </div>
        `;
        scheduleContainer.insertAdjacentHTML('beforeend', cardHTML);
    });
    
    // Eğer tüm tatiller bitmişse ve geçmiş tatiller gizleniyorsa boş durumu mesajı göster
    if (displayedCount === 0) {
        scheduleContainer.innerHTML = `
            <div class="col-span-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-10 sm:p-12 flex flex-col items-center justify-center text-center opacity-0 animate-fadeInUp shadow-sm">
                <svg class="w-12 h-12 text-slate-300 dark:text-slate-600 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"></path></svg>
                <h3 class="text-lg font-bold text-slate-700 dark:text-slate-200 mb-1">Yaklaşan Tatil Yok</h3>
                <p class="text-sm text-slate-500 dark:text-slate-400 max-w-md">Seçtiğiniz şehre veya kriterlere uygun yaklaşan bir tatil bulunmuyor.</p>
            </div>
        `;
    }

    // Ana durumu ve sayacı güncelle
    const statusEl = document.getElementById('status-indicator');
    
    if (isHoliday) {
        statusEl.innerHTML = `
            <div class="inline-flex flex-col items-center justify-center space-y-3">
                <div class="inline-flex items-center gap-4 bg-emerald-400/20 dark:bg-emerald-500/20 backdrop-blur-md text-emerald-700 dark:text-emerald-300 px-8 py-4 sm:px-12 sm:py-6 rounded-[2rem] border border-emerald-300/40 dark:border-emerald-400/20 shadow-lg animate-pulseSlow transform hover:scale-105 transition-all">
                    <span class="text-5xl sm:text-6xl drop-shadow-md">🎉</span>
                    <span class="text-5xl sm:text-6xl font-black tracking-tight drop-shadow-md">EVET!</span>
                </div>
                <p class="text-slate-800 dark:text-slate-100 font-semibold sm:text-lg backdrop-blur-md bg-white/30 dark:bg-slate-900/30 px-5 py-2 rounded-full shadow-sm border border-white/40 dark:border-slate-700/40">Bugün okul yok, dinlenme zamanı!</p>
            </div>
        `;
        statusEl.className = "mb-10 transition-all duration-500 scale-105 transform";
    } else {
        statusEl.innerHTML = `
            <div class="inline-flex flex-col items-center justify-center space-y-3">
                <div class="inline-flex items-center gap-4 bg-white/40 dark:bg-slate-900/40 backdrop-blur-md text-slate-900 dark:text-white px-8 py-4 sm:px-12 sm:py-6 rounded-[2rem] border border-white/50 dark:border-slate-700/50 shadow-xl transform hover:-translate-y-1 transition-all">
                    <span class="text-5xl sm:text-6xl drop-shadow-md opacity-90">🎒</span>
                    <span class="text-5xl sm:text-6xl font-black tracking-tight drop-shadow-md">HAYIR</span>
                </div>
                <p class="text-slate-800 dark:text-slate-100 font-semibold sm:text-lg backdrop-blur-md bg-white/30 dark:bg-slate-900/30 px-5 py-2 rounded-full shadow-sm border border-white/40 dark:border-slate-700/40">Eğitim öğretim devam ediyor, iyi dersler!</p>
            </div>
        `;
        statusEl.className = "mb-10 transition-all duration-500";
    }

    updateCountdown();
    
    loadWeatherForCity(selectedCity);

    // Görünüm (Liste/Takvim) Seçimine Göre Ekranı Ayarla
    const calendarContainer = document.getElementById('calendar-container');
    const filterPastWrapper = document.getElementById('filter-past-wrapper');
    
    if (currentView === 'list') {
        scheduleContainer.classList.add('view-visible');
        scheduleContainer.classList.remove('view-hidden');
        
        calendarContainer.classList.add('view-hidden');
        calendarContainer.classList.remove('view-visible');

        if(filterPastWrapper) filterPastWrapper.classList.remove('hidden');
    } else {
        scheduleContainer.classList.add('view-hidden');
        scheduleContainer.classList.remove('view-visible');

        calendarContainer.classList.add('view-visible');
        calendarContainer.classList.remove('view-hidden');
        
        if(filterPastWrapper) filterPastWrapper.classList.add('hidden');
        renderCalendar();
    }

    if (typeof renderSiteNotifications === 'function') renderSiteNotifications();
}

function renderCalendar() {
    const monthYearEl = document.getElementById('calendar-month-year');
    const gridEl = document.getElementById('calendar-grid');
    
    const monthNames = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];
    monthYearEl.textContent = `${monthNames[currentMonth]} ${currentYear}`;
    
    gridEl.innerHTML = "";
    
    const firstDay = new Date(currentYear, currentMonth, 1).getDay();
    const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
    
    let firstDayIndex = firstDay - 1;
    if (firstDayIndex === -1) firstDayIndex = 6;
    
    for (let i = 0; i < firstDayIndex; i++) {
        gridEl.innerHTML += `<div></div>`;
    }
    
    // Bugünün başlangıç zamanını hesapla (Geçmiş günleri tespit etmek için)
    const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();

    for (let day = 1; day <= daysInMonth; day++) {
        const date = new Date(currentYear, currentMonth, day).getTime();
        
        let isHolidayDate = false;
        let holidayType = null;
        let holidayNames = [];
        
        const filteredHolidays = holidays.filter(h => selectedCity === 'all' || !h.city || h.city === 'genel' || h.city === selectedCity);

        for (const holiday of filteredHolidays) {
            if (holiday.status === 'cancelled') continue; // İptal edilenler takvimde vurgulanmaz
            const start = getStartOfDay(holiday.start);
            const end = getEndOfDay(holiday.end);
            if (date >= start && date <= end) {
                isHolidayDate = true;
                holidayType = holiday.type;
                if(!holidayNames.includes(holiday.name)) holidayNames.push(holiday.name);
            }
        }
        
        const isToday = (day === today.getDate() && currentMonth === today.getMonth() && currentYear === today.getFullYear());
        let dayClass = "w-8 h-8 sm:w-10 sm:h-10 md:w-14 md:h-14 mx-auto flex items-center justify-center rounded-full text-slate-700 dark:text-slate-200 transition-all cursor-default relative group text-[10px] sm:text-sm md:text-base";
        
        if (isHolidayDate) {
            dayClass += ` bg-slate-800 dark:bg-slate-200 text-white dark:text-slate-900 font-bold border-2 border-slate-800 dark:border-slate-200 shadow-sm z-10 hover:scale-110 hover:z-20 cursor-help`;
        } else if (isToday) {
            dayClass += " bg-slate-200 dark:bg-slate-700 font-bold border-2 border-transparent";
        } else {
            dayClass += " hover:bg-slate-100 dark:hover:bg-slate-700/50 border-2 border-transparent";
        }
        
        // Geçmişteki tüm günleri (tatil veya normal) hafifçe soluklaştır
        if (date < startOfToday) {
            dayClass += " opacity-40 grayscale";
        }

        const tooltipHTML = isHolidayDate ? `<div class="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity bg-slate-800 dark:bg-slate-100 text-white dark:text-slate-900 text-xs px-3 py-1.5 rounded shadow-lg pointer-events-none whitespace-nowrap z-50 font-medium">${holidayNames.join(', ')}<div class="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-slate-800 dark:border-t-slate-100"></div></div>` : '';
        
        gridEl.innerHTML += `<div class="relative flex justify-center items-center py-0.5 sm:py-1 md:p-2"><div class="${dayClass}"><span>${day}</span>${tooltipHTML}</div></div>`;
    }
}

// --- ZİYARETÇİ SAYACI MANTIĞI ---
function initVisitorCounter() {
    if (!db) return;
    const statsRef = doc(db, "site_stats", "visitors");
    const todayDate = new Date();
    const todayStr = todayDate.toISOString().split('T')[0]; // Örn: "2026-05-20"
    const currentHour = todayDate.getHours();
    
    const dailyStatsRef = doc(db, "site_stats", `daily_${todayStr}`);
    const hourlyStatsRef = doc(db, "site_stats", `hourly_${todayStr}_${currentHour}`);

    const lastVisit = localStorage.getItem("lastVisitDate");

    // Eğer kullanıcı siteye BUGÜN ilk defa giriyorsa
    if (lastVisit !== todayStr) {
        if (!localStorage.getItem("hasVisited")) {
            setDoc(statsRef, { count: increment(1) }, { merge: true }).catch(err => console.error("Toplam ziyaretçi sayılamadı:", err));
            localStorage.setItem("hasVisited", "true");
        }
        
        // Günlük sayacı artır
        setDoc(dailyStatsRef, { count: increment(1) }, { merge: true })
            .then(() => {
                localStorage.setItem("lastVisitDate", todayStr);
                // Saatlik sayacı da artır
                setDoc(hourlyStatsRef, { count: increment(1) }, { merge: true }).catch(err => console.error("Saatlik ziyaretçi sayılamadı:", err));
            })
            .catch(err => console.error("Ziyaretçi sayılamadı:", err));
    }

    // Canlı olarak sayacı dinle ve ekranda göster
    onSnapshot(statsRef, (docSnap) => {
        const countEl = document.getElementById("visitor-count");
        if (docSnap.exists() && countEl) countEl.textContent = docSnap.data().count.toLocaleString('tr-TR');
    });
}

async function initApp() {
    const currentYear = today.getFullYear();
    
    // 1. Ekranı API'yi beklemeden var olan MEB tatilleriyle hemen render et (FCP optimizasyonu)
    updateDOM();
    
    // Firebase'den Özel (Admin) Tatillerini Çek
    if (db) {
        try {
            const querySnapshot = await getDocs(collection(db, "custom_holidays"));
            const customHolidays = [];
            querySnapshot.forEach((doc) => {
                customHolidays.push(doc.data());
            });
            if (customHolidays.length > 0) {
                holidays = [...holidays, ...customHolidays].sort((a, b) => getStartOfDay(a.start) - getStartOfDay(b.start));
                updateDOM(); // Ekstra tatiller gelince ekranı yenile
            }
        } catch (error) {
            console.error("Özel tatiller Firebase'den çekilemedi:", error);
        }
    }

    try {
        // 2. Arka planda Nager API üzerinden resmi tatilleri çek
        const response = await fetch(`https://date.nager.at/api/v3/PublicHolidays/${currentYear}/TR`);
        if (response.ok) {
            const publicHolidaysData = await response.json();
            const publicHolidays = publicHolidaysData
                .filter(holiday => {
                    const locName = (holiday.localName || "").toLowerCase();
                    const engName = (holiday.name || "").toLowerCase();
                    return !locName.includes('ramazan') && !locName.includes('kurban') && !engName.includes('ramadan') && !engName.includes('sacrifice');
                })
                .map(holiday => ({
                    name: holiday.localName,
                    start: holiday.date,
                    end: holiday.date,
                    duration: "1 Gün",
                    type: "public"
                }));
            
            // Sistem (API) tatilleriyle özel tatillerin çakışmasını engelle (Özel tatil önceliklidir)
            const filteredPublicHolidays = publicHolidays.filter(pubHol => !holidays.some(h => h.start === pubHol.start));
            
            holidays = [...holidays, ...filteredPublicHolidays].sort((a, b) => getStartOfDay(a.start) - getStartOfDay(b.start));
            
            // 3. API'den gelen ekstra tatiller eklenince ekranı tekrar çiz
            updateDOM();
        }
    } catch (error) {
        console.error("Resmi tatiller API'den çekilemedi:", error);
    }

    // Ziyaretçi sayacını başlat
    initVisitorCounter();

    setInterval(updateCountdown, 60000);
}

// Gece Modu (Dark Mode) Yönetimi
const themeToggleDarkIcon = document.getElementById('theme-toggle-dark-icon');
const themeToggleLightIcon = document.getElementById('theme-toggle-light-icon');
const themeToggleBtn = document.getElementById('theme-toggle');

// Başlangıçta ikonları duruma göre değiştir
if (document.documentElement.classList.contains('dark')) {
    themeToggleLightIcon.classList.remove('hidden');
} else {
    themeToggleDarkIcon.classList.remove('hidden');
}

themeToggleBtn.addEventListener('click', function() {
    // İkonları gizle/göster
    themeToggleDarkIcon.classList.toggle('hidden');
    themeToggleLightIcon.classList.toggle('hidden');

    // Temayı (class'ı) tersine çevir ve yeni durumu localStorage'a kaydet
    const isDark = document.documentElement.classList.toggle('dark');
    localStorage.setItem('color-theme', isDark ? 'dark' : 'light');
});

// Geçmiş Tatilleri Gizleme Filtresi Olayı
const filterPastToggle = document.getElementById('filter-past-toggle');
filterPastToggle.checked = hidePastHolidays;
filterPastToggle.addEventListener('change', (e) => {
    hidePastHolidays = e.target.checked;
    localStorage.setItem('hide-past-holidays', hidePastHolidays);
    updateDOM(); // Ekranı filtrelenmiş veriye göre yeniden çiz
});

// Yukarı Çık (Scroll to Top) Butonu Mantığı
const scrollToTopBtn = document.getElementById('scroll-to-top-btn');

window.addEventListener('scroll', () => {
    // Sayfa 300px'den fazla aşağı kaydırıldıysa butonu göster
    if (window.scrollY > 300) {
        scrollToTopBtn.classList.remove('opacity-0', 'translate-y-10', 'pointer-events-none');
        scrollToTopBtn.classList.add('opacity-100', 'translate-y-0', 'pointer-events-auto');
    } else {
        scrollToTopBtn.classList.add('opacity-0', 'translate-y-10', 'pointer-events-none');
        scrollToTopBtn.classList.remove('opacity-100', 'translate-y-0', 'pointer-events-auto');
    }
}, { passive: true }); // Kaydırma performansını engellememesi için eklendi

scrollToTopBtn.addEventListener('click', () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
});

// Takvim / Liste Görünümü Buton Kontrolleri
const viewListBtn = document.getElementById('view-list-btn');
const viewCalendarBtn = document.getElementById('view-calendar-btn');

function updateViewButtons() {
    if (!viewListBtn || !viewCalendarBtn) return;
    if (currentView === 'list') {
        viewListBtn.className = "px-4 py-1.5 text-sm font-medium rounded-md bg-white dark:bg-slate-800 shadow-sm text-slate-900 dark:text-white transition-all";
        viewCalendarBtn.className = "px-4 py-1.5 text-sm font-medium rounded-md text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-all";
    } else {
        viewCalendarBtn.className = "px-4 py-1.5 text-sm font-medium rounded-md bg-white dark:bg-slate-800 shadow-sm text-slate-900 dark:text-white transition-all";
        viewListBtn.className = "px-4 py-1.5 text-sm font-medium rounded-md text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-all";
    }
}

viewListBtn?.addEventListener('click', () => { currentView = 'list'; localStorage.setItem('calendar-view', 'list'); updateViewButtons(); updateDOM(); });
viewCalendarBtn?.addEventListener('click', () => { currentView = 'calendar'; localStorage.setItem('calendar-view', 'calendar'); updateViewButtons(); updateDOM(); });
updateViewButtons();

// Takvim İleri / Geri Butonları Olayları
document.getElementById('prev-month-btn')?.addEventListener('click', () => {
    currentMonth--;
    if (currentMonth < 0) {
        currentMonth = 11;
        currentYear--;
    }
    renderCalendar();
});
document.getElementById('next-month-btn')?.addEventListener('click', () => {
    currentMonth++;
    if (currentMonth > 11) {
        currentMonth = 0;
        currentYear++;
    }
    renderCalendar();
});

// --- CANLI DUYURU BANDI (MARQUEE) DİNLEYİCİSİ ---
if (db) {
    onSnapshot(doc(db, "site_settings", "announcement"), (docSnap) => {
        const banner = document.getElementById('announcement-banner');
        const textDisplay = document.getElementById('announcement-text-display');
        if (banner && textDisplay && docSnap.exists()) {
            const data = docSnap.data();
            if (data.isActive && data.text) {
                // Yazının akıcı dönmesi için araya boşluklar koyarak metni çoğaltıyoruz
                textDisplay.textContent = `${data.text} \u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0 ${data.text}`;
                banner.classList.remove('hidden');
            } else {
                banner.classList.add('hidden');
            }
        }
    });
}

// --- ANLIK VE GEÇMİŞ BİLDİRİMLER (SİTE İÇİ) SİSTEMİ ---
function showAppToast(title, message) {
    const toastContainer = document.getElementById("app-toast-container");
    if (!toastContainer) return;

    const toast = document.createElement("div");
    toast.className = "flex flex-col gap-1 p-4 rounded-2xl shadow-2xl transform translate-x-full opacity-0 transition-all duration-500 w-80 pointer-events-auto border backdrop-blur-xl bg-white/90 dark:bg-slate-800/90 border-slate-200 dark:border-slate-700 cursor-pointer";
    
    toast.innerHTML = `
        <div class="flex items-center gap-2 mb-1">
            <div class="w-8 h-8 rounded-full bg-indigo-100 dark:bg-indigo-900/50 flex items-center justify-center shrink-0">
                <svg class="w-4 h-4 text-indigo-600 dark:text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"></path></svg>
            </div>
            <span class="text-sm font-bold text-slate-800 dark:text-slate-100">${title}</span>
        </div>
        <span class="text-xs font-medium text-slate-600 dark:text-slate-400 leading-relaxed pl-10">${message}</span>
    `;

    toast.addEventListener('click', () => {
        toast.classList.add("opacity-0", "translate-x-full");
        setTimeout(() => toast.remove(), 500);
    });

    toastContainer.appendChild(toast);
    setTimeout(() => toast.classList.remove("translate-x-full", "opacity-0"), 10);
    
    // 8 saniye sonra otomatik gizle
    setTimeout(() => {
        if(toast.parentElement) {
            toast.classList.add("opacity-0", "translate-x-full");
            setTimeout(() => toast.remove(), 500);
        }
    }, 8000);
}

let allSiteNotifications = [];
function renderSiteNotifications() {
    const list = document.getElementById("notification-list");
    const badge = document.getElementById("notification-badge");
    if (!list || !badge) return;

    let hasNew = false;
    let lastRead = parseInt(localStorage.getItem('last-read-notification') || '0');

    // Bildirimleri şehre göre filtrele (Hedef şehir 'all' ise veya kullanıcının seçtiği şehirse göster)
    const filteredNotifications = allSiteNotifications.filter(n => !n.targetCity || n.targetCity === 'all' || n.targetCity === selectedCity);

    if (filteredNotifications.length === 0) {
        list.innerHTML = '<div class="text-center text-sm text-slate-500 dark:text-slate-400 py-6 font-medium">Henüz bildirim yok.</div>';
        badge.classList.add("hidden");
        return;
    }

    list.innerHTML = "";
    filteredNotifications.forEach(data => {
        const isUnread = data.timestamp > lastRead;
        if (isUnread) hasNew = true;

        list.innerHTML += `
            <div class="p-3 bg-slate-50 dark:bg-slate-700/30 rounded-lg border border-slate-100 dark:border-slate-600/50 hover:bg-slate-100 dark:hover:bg-slate-700/50 transition-colors ${isUnread ? 'border-l-2 border-l-indigo-500' : ''}">
                <div class="flex justify-between items-start mb-1 gap-2">
                    <h4 class="font-bold text-slate-800 dark:text-slate-200 text-sm leading-tight">${data.title}</h4>
                    <span class="text-[10px] text-slate-400 whitespace-nowrap shrink-0">${data.dateStr}</span>
                </div>
                <p class="text-xs text-slate-600 dark:text-slate-400 leading-relaxed line-clamp-3">${data.body}</p>
            </div>
        `;
    });

    if (hasNew) badge.classList.remove("hidden");
    else badge.classList.add("hidden");
}

if (db) {
    const notifBtn = document.getElementById("notification-btn");
    const notifDropdown = document.getElementById("notification-dropdown");
    let initialLoad = true;

    onSnapshot(query(collection(db, "site_notifications"), orderBy("timestamp", "desc")), (snapshot) => {
        allSiteNotifications = [];
        let lastRead = parseInt(localStorage.getItem('last-read-notification') || '0');
        
        snapshot.forEach(doc => {
            const data = doc.data();
            allSiteNotifications.push(data);
            
            // Uygulama açıkken yeni ve kullanıcıyı ilgilendiren bir bildirim gelirse ekranda Toast olarak göster
            if (!initialLoad && data.timestamp > lastRead) {
                if (!data.targetCity || data.targetCity === 'all' || data.targetCity === selectedCity) {
                    showAppToast(data.title, data.body);
                }
            }
        });

        renderSiteNotifications();
        initialLoad = false;
    });

    // Dropdown açma kapama ve Okundu işaretleme logic'i
    if (notifBtn && notifDropdown) {
        notifBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            if (notifDropdown.classList.contains("hidden")) {
                notifDropdown.classList.remove("hidden", "opacity-0", "-translate-y-2");
                notifDropdown.classList.add("flex");
            } else {
                notifDropdown.classList.add("opacity-0", "-translate-y-2");
                setTimeout(() => notifDropdown.classList.add("hidden"), 150);
            }
        });
        document.addEventListener("click", (e) => {
            if (!notifBtn.contains(e.target) && !notifDropdown.contains(e.target)) {
                notifDropdown.classList.add("opacity-0", "-translate-y-2");
                setTimeout(() => notifDropdown.classList.add("hidden"), 150);
            }
        });
        document.getElementById("mark-read-btn")?.addEventListener("click", () => {
            localStorage.setItem('last-read-notification', new Date().getTime().toString());
            document.getElementById("notification-badge").classList.add("hidden");
            const unreadBorders = document.querySelectorAll('.border-l-indigo-500');
            unreadBorders.forEach(el => el.classList.remove('border-l-2', 'border-l-indigo-500'));
        });
    }
}

// Uygulamayı Başlat
initApp();

// --- İNTERNET BAĞLANTISI (ONLINE/OFFLINE) KONTROLÜ ---
const networkBanner = document.getElementById('network-status-banner');
const networkIcon = document.getElementById('network-status-icon');
const networkText = document.getElementById('network-status-text');
let networkBannerTimeout;

function showNetworkStatus(isOnline) {
    if (!networkBanner) return;
    clearTimeout(networkBannerTimeout);
    
    if (isOnline) {
        networkBanner.className = "fixed top-5 left-1/2 -translate-x-1/2 z-[100] flex items-center gap-3 px-5 py-3 rounded-2xl shadow-xl transition-all duration-500 backdrop-blur-md border bg-emerald-600/90 dark:bg-emerald-900/90 border-emerald-500/50 text-white translate-y-0 opacity-100 pointer-events-none";
        networkIcon.innerHTML = `<svg class="w-5 h-5 shrink-0 text-emerald-100 dark:text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path></svg>`;
        networkText.textContent = "İnternet bağlantısı sağlandı.";
    } else {
        networkBanner.className = "fixed top-5 left-1/2 -translate-x-1/2 z-[100] flex items-center gap-3 px-5 py-3 rounded-2xl shadow-xl transition-all duration-500 backdrop-blur-md border bg-rose-600/90 dark:bg-rose-900/90 border-rose-500/50 text-white translate-y-0 opacity-100 pointer-events-none";
        networkIcon.innerHTML = `<svg class="w-5 h-5 shrink-0 text-rose-100 dark:text-rose-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M18.364 5.636a9 9 0 010 12.728m0 0l-2.829-2.829m2.829 2.829L21 21M15.536 8.464a5 5 0 010 7.072m0 0l-2.829-2.829m-4.243-4.243a5 5 0 000 7.072m0 0L3 21m5.657-9.9a9 9 0 0112.728 0m-12.728 0L3 3"></path></svg>`;
        networkText.textContent = "Bağlantı koptu. Çevrimdışı moddasınız.";
    }
    
    networkBannerTimeout = setTimeout(() => {
        networkBanner.classList.replace('translate-y-0', '-translate-y-32');
        networkBanner.classList.replace('opacity-100', 'opacity-0');
    }, isOnline ? 3000 : 5000);
}

window.addEventListener('online', () => showNetworkStatus(true));
window.addEventListener('offline', () => showNetworkStatus(false));

// --- KAYNAK KOD KORUMASI (Sağ Tık ve Geliştirici Araçları Engelleme) ---
document.addEventListener('contextmenu', (e) => e.preventDefault());

document.addEventListener('keydown', (e) => {
    // F12 tuşunu engelle
    if (e.key === 'F12') {
        e.preventDefault();
    }
    // Ctrl+Shift+I, Ctrl+Shift+J, Ctrl+Shift+C engelleme (Geliştirici Araçları)
    if (e.ctrlKey && e.shiftKey && ['I', 'i', 'J', 'j', 'C', 'c'].includes(e.key)) {
        e.preventDefault();
    }
    // Ctrl+U engelleme (Kaynağı Görüntüle)
    if (e.ctrlKey && ['U', 'u'].includes(e.key)) {
        e.preventDefault();
    }
});

// --- UYGULAMAYI İNDİR (PWA KURULUM) MANTIĞI ---
const installAppBtn = document.getElementById('install-app-btn');

if (installAppBtn) {
    installAppBtn.addEventListener('click', async () => {
        if (!window.deferredPrompt) return;
        // Kurulum uyarısını (sistem penceresini) göster
        window.deferredPrompt.prompt();
        // Kullanıcının kararını bekle
        const { outcome } = await window.deferredPrompt.userChoice;
        // İşlem tamamlandıktan sonra saklanan olayı temizle
        window.deferredPrompt = null;
        // İndirme butonunu geri gizle
        installAppBtn.classList.add('hidden');
    });
}

window.addEventListener('appinstalled', () => {
    // Kurulum tamamen bittiyse log düş ve hafızayı temizle
    window.deferredPrompt = null;
    if (installAppBtn) installAppBtn.classList.add('hidden');
});

function initPushNotifications(swRegistration) {
    if (!messaging) return;
    const banner = document.getElementById('push-notification-banner');
    const enableBtn = document.getElementById('enable-push-btn');
    const dismissBtn = document.getElementById('dismiss-push-btn');

    // Eğer bildirim izni daha önce sorulmadıysa 4 saniye sonra afişi çıkar
    if (Notification.permission === 'default' && !localStorage.getItem('push-dismissed')) {
        setTimeout(() => {
            banner.classList.remove('hidden');
            void banner.offsetWidth; // Reflow tetikle
            banner.classList.remove('translate-y-[150%]', 'opacity-0');
        }, 4000);
    }

    dismissBtn?.addEventListener('click', () => {
        banner.classList.add('translate-y-[150%]', 'opacity-0');
        setTimeout(() => banner.classList.add('hidden'), 500);
        localStorage.setItem('push-dismissed', 'true');
    });

    enableBtn?.addEventListener('click', async () => {
        const originalText = enableBtn.textContent;
        enableBtn.disabled = true;
        enableBtn.textContent = "Lütfen Bekleyin...";
        try {
            const permission = await Notification.requestPermission();
            if (permission === 'granted') {
                const token = await getToken(messaging, { vapidKey: firebaseConfig.vapidKey, serviceWorkerRegistration: swRegistration });
                if (token) await setDoc(doc(db, 'fcm_tokens', token), { token: token, city: selectedCity, timestamp: new Date().toISOString() }, { merge: true });
                alert("Harika! Bildirimler başarıyla açıldı.");
            } else {
                alert("Bildirim izni reddedildi. Bildirim almak için tarayıcınızın adres çubuğundaki kilit (🔒) ikonuna tıklayıp bildirimlere izin vermeniz gerekir.");
            }
            banner.classList.add('translate-y-[150%]', 'opacity-0');
            setTimeout(() => banner.classList.add('hidden'), 500);
        } catch (error) { 
            alert("Sistemsel bir hata oluştu! Eğer site sahibiyseniz 'config.js' içindeki 'vapidKey' anahtarını oluşturduğunuzdan emin olun.\n\nHata: " + error.message);
            enableBtn.disabled = false;
            enableBtn.textContent = originalText;
        }
    });

    // Site açıkken bildirim gelirse uygulama içinde uyarı olarak göster
    onMessage(messaging, (payload) => {
        alert(`🔔 DUYURU: ${payload.notification.title}\n${payload.notification.body}`);
    });
}

// --- PWA (Service Worker) KAYDI ---
if ('serviceWorker' in navigator) {
    let refreshing = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (!refreshing) {
            window.location.reload();
            refreshing = true;
        }
    });

    window.addEventListener('load', () => {
        // config.js'den gelen bilgileri URL parametresine çevirip Service Worker'a aktarıyoruz
        const swConfigParams = new URLSearchParams(firebaseConfig).toString();
        navigator.serviceWorker.register(`/sw.js?${swConfigParams}`)
            .then(registration => {
                console.log('PWA ServiceWorker başarıyla kaydedildi.', registration.scope);
                initPushNotifications(registration);
                    
                    // PWA Güncelleme Kontrolü (Yeni sürüm varsa Prompt göster)
                    registration.addEventListener('updatefound', () => {
                        const newWorker = registration.installing;
                        newWorker.addEventListener('statechange', () => {
                            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                                const updatePrompt = document.getElementById('pwa-update-prompt');
                                const updateBtn = document.getElementById('pwa-update-btn');
                                const dismissBtn = document.getElementById('pwa-update-dismiss');
                                
                                if (updatePrompt) {
                                    updatePrompt.classList.remove('translate-y-24', 'opacity-0', 'pointer-events-none');
                                    updateBtn?.addEventListener('click', () => {
                                        updatePrompt.classList.add('translate-y-24', 'opacity-0', 'pointer-events-none');
                                        newWorker.postMessage({ type: 'SKIP_WAITING' });
                                    });
                                    dismissBtn?.addEventListener('click', () => {
                                        updatePrompt.classList.add('translate-y-24', 'opacity-0', 'pointer-events-none');
                                    });
                                }
                            }
                        });
                    });
            })
            .catch(err => console.error('PWA ServiceWorker hatası:', err));
    });
}
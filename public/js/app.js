import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getFirestore, collection, getDocs } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { firebaseConfig, initialHolidays } from "./config.js";

// Firebase Başlatma (Config eklendiyse çalışır)
const app = firebaseConfig.apiKey ? initializeApp(firebaseConfig) : null;
const db = app ? getFirestore(app) : null;

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
        `<span class="font-bold text-indigo-600 dark:text-indigo-400">${days}</span> Gün 
         <span class="font-bold text-indigo-600 dark:text-indigo-400">${hours}</span> Saat 
         <span class="font-bold text-indigo-600 dark:text-indigo-400">${minutes}</span> Dakika`;
}

function updateDOM() {
    const scheduleContainer = document.getElementById('holiday-schedule');
    scheduleContainer.innerHTML = "";

    // Hesaplama state'ini sıfırla
    isHoliday = false;
    nextHoliday = null;
    let displayedCount = 0;

    holidays.forEach((holiday, index) => {
        const start = getStartOfDay(holiday.start);
        const end = getEndOfDay(holiday.end);
        const isPast = end < todayTime;

        if (todayTime >= start && todayTime <= end) isHoliday = true;
        if (start > todayTime && (!nextHoliday || start < getStartOfDay(nextHoliday.start))) nextHoliday = holiday;

        // Eğer "Geçmişi Gizle" seçiliyse ve tatil bittiyse kartı çizmeden geç
        if (hidePastHolidays && isPast) return;
        displayedCount++;

        // Daha modern etkileşimli kart sınıfları ve sırayla geliş animasyonu
        const interactionClass = isPast 
            ? "opacity-60 grayscale bg-slate-50 dark:bg-slate-800/50" 
            : "bg-white dark:bg-slate-800 hover:-translate-y-1.5 hover:shadow-xl hover:shadow-indigo-500/10 dark:hover:shadow-indigo-900/20 hover:border-indigo-300 dark:hover:border-indigo-700 cursor-default";
        const dateRange = start === end ? formatDate(holiday.start) : `${formatDate(holiday.start)} - ${formatDate(holiday.end)}`;

        // Takvim yaprağı görünümü için tarihi ayrıştırıyoruz (Sol taraftaki ikonik takvim için)
        const startLeaf = new Date(holiday.start);
        const leafMonth = startLeaf.toLocaleDateString('tr-TR', { month: 'short' });
        const leafDay = startLeaf.toLocaleDateString('tr-TR', { day: 'numeric' });
        const leafWeekday = startLeaf.toLocaleDateString('tr-TR', { weekday: 'short' });

        // Türüne Göre Renklendirme ve Etiketler
        const isMeb = holiday.type === 'meb';
        const leafBgClass = isMeb ? 'bg-indigo-50 dark:bg-indigo-900/20 border-indigo-100 dark:border-indigo-800/50' : 'bg-rose-50 dark:bg-rose-900/20 border-rose-100 dark:border-rose-800/50';
        const leafTextClass = isMeb ? 'text-indigo-600 dark:text-indigo-400' : 'text-rose-600 dark:text-rose-400';
        const badgeClass = isMeb ? 'bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-400 border-indigo-200 dark:border-indigo-800/50' : 'bg-rose-100 dark:bg-rose-900/40 text-rose-700 dark:text-rose-400 border-rose-200 dark:border-rose-800/50';
        const typeLabel = isMeb ? 'Okul Tatili' : 'Resmi Tatil';
        const gCalLink = getGoogleCalendarLink(holiday);

        const cardHTML = `
            <div class="${interactionClass} border border-slate-200 dark:border-slate-700 rounded-2xl p-4 sm:p-5 flex items-center gap-3 sm:gap-5 transition-all duration-300 opacity-0 animate-fadeInUp" style="animation-delay: ${index * 100}ms;">
                <!-- Takvim Yaprağı İkonu -->
                <div class="flex flex-col items-center justify-center rounded-xl min-w-[60px] sm:min-w-[75px] h-[70px] sm:h-[80px] border shadow-sm shrink-0 ${leafBgClass}">
                    <span class="text-xs font-bold uppercase tracking-wider ${leafTextClass}">${leafMonth}</span>
                    <span class="text-xl sm:text-2xl font-black text-slate-800 dark:text-slate-100 leading-none my-0.5">${leafDay}</span>
                    <span class="text-[10px] font-medium text-slate-500 dark:text-slate-400 uppercase">${leafWeekday}</span>
                </div>
                
                <!-- Tatil Bilgileri -->
                <div class="flex-1 min-w-0">
                    <div class="flex justify-between items-start gap-2">
                        <h3 class="font-bold text-lg text-slate-800 dark:text-slate-100 leading-tight mb-1 truncate" title="${holiday.name}">${holiday.name}</h3>
                        <a href="${gCalLink}" target="_blank" rel="noopener noreferrer" class="text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors shrink-0" title="Google Takvim'e Ekle">
                            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"></path></svg>
                        </a>
                    </div>
                    <p class="text-xs text-slate-500 dark:text-slate-400 mb-2 leading-relaxed line-clamp-2" title="${dateRange}">
                        ${dateRange}
                    </p>
                    <div class="mt-auto flex flex-wrap gap-2">
                        <span class="inline-block rounded-md px-2 py-0.5 text-xs font-semibold tracking-wide border ${badgeClass}">${typeLabel}</span>
                        <span class="inline-block bg-slate-100 dark:bg-slate-700/50 text-slate-600 dark:text-slate-300 rounded-md px-2 py-0.5 text-xs font-semibold tracking-wide border border-slate-200 dark:border-slate-600">Süre: ${holiday.duration}</span>
                    </div>
                </div>
            </div>
        `;
        scheduleContainer.insertAdjacentHTML('beforeend', cardHTML);
    });
    
    // Eğer tüm tatiller bitmişse ve geçmiş tatiller gizleniyorsa boş durumu mesajı göster
    if (displayedCount === 0) {
        scheduleContainer.innerHTML = `<div class="col-span-full text-center py-8 text-slate-500 dark:text-slate-400 font-medium opacity-0 animate-fadeInUp">Gösterilecek yaklaşan tatil bulunmamaktadır.</div>`;
    }

    // Ana durumu ve sayacı güncelle
    const statusEl = document.getElementById('status-indicator');
    statusEl.textContent = isHoliday ? "EVET" : "HAYIR";
    
    if (isHoliday) {
        // Tatil günüyse ekstra dikkat çekici animasyon
        statusEl.className = "text-6xl md:text-7xl font-black mb-8 transition-colors duration-300 text-indigo-500 animate-pulseSlow scale-105 transform";
    } else {
        statusEl.className = "text-6xl md:text-7xl font-black mb-8 transition-colors duration-300 text-rose-500";
    }

    updateCountdown();

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
        
        for (const holiday of holidays) {
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
            const baseColor = holidayType === 'meb' ? 'indigo' : 'rose';
            dayClass += ` bg-${baseColor}-100 dark:bg-${baseColor}-900/40 text-${baseColor}-800 dark:text-${baseColor}-300 font-bold border-2 border-${baseColor}-400 dark:border-${baseColor}-600 shadow-sm z-10 hover:scale-110 hover:z-20 cursor-help`;
        } else if (isToday) {
            dayClass += " bg-slate-200 dark:bg-slate-700 font-bold";
        } else {
            dayClass += " hover:bg-slate-100 dark:hover:bg-slate-700/50";
        }
        
        // Geçmişteki tüm günleri (tatil veya normal) hafifçe soluklaştır
        if (date < startOfToday) {
            dayClass += " opacity-40 grayscale";
        }

        const tooltipHTML = isHolidayDate ? `<div class="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity bg-slate-800 dark:bg-slate-100 text-white dark:text-slate-900 text-xs px-3 py-1.5 rounded shadow-lg pointer-events-none whitespace-nowrap z-50 font-medium">${holidayNames.join(', ')}<div class="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-slate-800 dark:border-t-slate-100"></div></div>` : '';
        
        gridEl.innerHTML += `<div class="relative flex justify-center items-center py-0.5 sm:py-1 md:p-2"><div class="${dayClass}"><span>${day}</span>${tooltipHTML}</div></div>`;
    }
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
            
            holidays = [...holidays, ...publicHolidays].sort((a, b) => getStartOfDay(a.start) - getStartOfDay(b.start));
            
            // 3. API'den gelen ekstra tatiller eklenince ekranı tekrar çiz
            updateDOM();
        }
    } catch (error) {
        console.error("Resmi tatiller API'den çekilemedi:", error);
    }

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
        viewListBtn.className = "px-4 py-1.5 text-sm font-medium rounded-md bg-white dark:bg-slate-800 shadow-sm text-indigo-600 dark:text-indigo-400 transition-all";
        viewCalendarBtn.className = "px-4 py-1.5 text-sm font-medium rounded-md text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-all";
    } else {
        viewCalendarBtn.className = "px-4 py-1.5 text-sm font-medium rounded-md bg-white dark:bg-slate-800 shadow-sm text-indigo-600 dark:text-indigo-400 transition-all";
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

// Uygulamayı Başlat
initApp();
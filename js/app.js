// MEB Okul Tatilleri (Milli Eğitim Bakanlığı verileri her yıl değiştiği için manuel eklenir)
let holidays = [
    { name: "Sömestr Tatili", start: "2026-01-19", end: "2026-01-30", duration: "14 Gün", type: "meb" },
    { name: "2. Ara Tatil", start: "2026-03-16", end: "2026-03-20", duration: "9 Gün", type: "meb" },
    { name: "Ramazan Bayramı", start: "2026-03-19", end: "2026-03-22", duration: "3.5 Gün", type: "public" },
    { name: "Kurban Bayramı", start: "2026-05-26", end: "2026-05-30", duration: "4.5 Gün", type: "public" },
    { name: "Yaz Tatili", start: "2026-06-26", end: "2026-09-07", duration: "73 Gün", type: "meb" },
    { name: "1. Ara Tatil", start: "2026-11-16", end: "2026-11-20", duration: "9 Gün", type: "meb" }
];

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
        `<span class="font-bold text-teal-600 dark:text-teal-400">${days}</span> Gün 
         <span class="font-bold text-teal-600 dark:text-teal-400">${hours}</span> Saat 
         <span class="font-bold text-teal-600 dark:text-teal-400">${minutes}</span> Dakika`;
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
            : "bg-white dark:bg-slate-800 hover:-translate-y-1.5 hover:shadow-xl hover:shadow-teal-500/10 dark:hover:shadow-teal-900/20 hover:border-teal-300 dark:hover:border-teal-700 cursor-default";
        const dateRange = start === end ? formatDate(holiday.start) : `${formatDate(holiday.start)} - ${formatDate(holiday.end)}`;

        // Takvim yaprağı görünümü için tarihi ayrıştırıyoruz (Sol taraftaki ikonik takvim için)
        const startLeaf = new Date(holiday.start);
        const leafMonth = startLeaf.toLocaleDateString('tr-TR', { month: 'short' });
        const leafDay = startLeaf.toLocaleDateString('tr-TR', { day: 'numeric' });
        const leafWeekday = startLeaf.toLocaleDateString('tr-TR', { weekday: 'short' });

        // Türüne Göre Renklendirme ve Etiketler
        const isMeb = holiday.type === 'meb';
        const leafBgClass = isMeb ? 'bg-teal-50 dark:bg-teal-900/20 border-teal-100 dark:border-teal-800/50' : 'bg-amber-50 dark:bg-amber-900/20 border-amber-100 dark:border-amber-800/50';
        const leafTextClass = isMeb ? 'text-teal-600 dark:text-teal-400' : 'text-amber-600 dark:text-amber-400';
        const badgeClass = isMeb ? 'bg-teal-100 dark:bg-teal-900/40 text-teal-700 dark:text-teal-400 border-teal-200 dark:border-teal-800/50' : 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-800/50';
        const typeLabel = isMeb ? 'Okul Tatili' : 'Resmi Tatil';
        const gCalLink = getGoogleCalendarLink(holiday);

        const cardHTML = `
            <div class="${interactionClass} border border-slate-200 dark:border-slate-700 rounded-2xl p-5 flex items-center gap-5 transition-all duration-300 opacity-0 animate-fadeInUp" style="animation-delay: ${index * 100}ms;">
                <!-- Takvim Yaprağı İkonu -->
                <div class="flex flex-col items-center justify-center rounded-xl min-w-[75px] h-[80px] border shadow-sm shrink-0 ${leafBgClass}">
                    <span class="text-xs font-bold uppercase tracking-wider ${leafTextClass}">${leafMonth}</span>
                    <span class="text-2xl font-black text-slate-800 dark:text-slate-100 leading-none my-0.5">${leafDay}</span>
                    <span class="text-[10px] font-medium text-slate-500 dark:text-slate-400 uppercase">${leafWeekday}</span>
                </div>
                
                <!-- Tatil Bilgileri -->
                <div class="flex-1 min-w-0">
                    <div class="flex justify-between items-start gap-2">
                        <h3 class="font-bold text-lg text-slate-800 dark:text-slate-100 leading-tight mb-1 truncate" title="${holiday.name}">${holiday.name}</h3>
                        <a href="${gCalLink}" target="_blank" rel="noopener noreferrer" class="text-slate-400 hover:text-teal-600 dark:hover:text-teal-400 transition-colors shrink-0" title="Google Takvim'e Ekle">
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
        statusEl.className = "text-6xl md:text-7xl font-black mb-8 transition-colors duration-300 text-emerald-500 animate-pulseSlow scale-105 transform";
    } else {
        statusEl.className = "text-6xl md:text-7xl font-black mb-8 transition-colors duration-300 text-rose-500";
    }

    updateCountdown();
}

async function initApp() {
    const currentYear = today.getFullYear();
    
    // 1. Ekranı API'yi beklemeden var olan MEB tatilleriyle hemen render et (FCP optimizasyonu)
    updateDOM();
    
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

// Uygulamayı Başlat
initApp();
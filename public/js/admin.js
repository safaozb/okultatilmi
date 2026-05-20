import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, onAuthStateChanged, signOut, setPersistence, browserSessionPersistence } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getFirestore, collection, addDoc, deleteDoc, doc, updateDoc, onSnapshot, getDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { firebaseConfig, initialHolidays } from "./config.js";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const loginSection = document.getElementById("login-section");
const adminSection = document.getElementById("admin-section");
const loginForm = document.getElementById("login-form");
const logoutBtn = document.getElementById("logout-btn");
const addHolidayForm = document.getElementById("add-holiday-form");
const currentHolidaysList = document.getElementById("current-holidays-list");
const noHolidaysMsg = document.getElementById("no-holidays-msg");
const loginButton = document.getElementById("login-button");
const loginButtonText = document.getElementById("login-button-text");
const loginSpinner = document.getElementById("login-spinner");

// Global variable to store the unsubscribe function for the real-time listener
let holidaysCollectionUnsubscribe = null;
let systemHolidaysData = [];
let firebaseHolidaysData = [];
let editHolidayId = null;
let overrideSystemStart = null;
let adminHidePastHolidays = localStorage.getItem('admin-hide-past') === 'true';
let visitorUnsubscribe = null;
let dailyVisitorUnsubscribe = null;
let visitorChart = null;
let subscribersUnsubscribe = null;

async function fetchSystemHolidays() {
    const currentYear = new Date().getFullYear();
    let apiHolidays = [];
    try {
        const response = await fetch(`https://date.nager.at/api/v3/PublicHolidays/${currentYear}/TR`);
        if (response.ok) {
            const data = await response.json();
            apiHolidays = data
                .filter(h => {
                    const locName = (h.localName || "").toLowerCase();
                    const engName = (h.name || "").toLowerCase();
                    return !locName.includes('ramazan') && !locName.includes('kurban') && !engName.includes('ramadan') && !engName.includes('sacrifice');
                })
                .map(h => ({
                    id: 'api-' + h.date,
                    name: h.localName,
                    start: h.date,
                    end: h.date,
                    duration: "1 Gün",
                    type: "public",
                    isSystem: true
                }));
        }
    } catch(e) { console.error("Admin API Error:", e); }

    const configHols = initialHolidays.map((h, i) => ({...h, id: 'config-'+i, isSystem: true}));
    systemHolidaysData = [...configHols, ...apiHolidays];
}

// --- GRAFİK (CHART.JS) SİSTEMİ ---
async function loadChartData() {
    const labels = [];
    const data = [];
    const promises = [];

    for (let i = 6; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const dateStr = d.toISOString().split('T')[0];
        labels.push(d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' }));
        promises.push(getDoc(doc(db, "site_stats", `daily_${dateStr}`)));
    }

    try {
        const results = await Promise.all(promises);
        results.forEach(snap => {
            data.push(snap.exists() ? snap.data().count : 0);
        });

        const ctx = document.getElementById('visitor-chart');
        if (!ctx) return;

        if (visitorChart) {
            visitorChart.destroy();
        }

        visitorChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Ziyaretçi Sayısı',
                    data: data,
                    borderColor: '#818cf8', // indigo-400
                    backgroundColor: 'rgba(129, 140, 248, 0.15)',
                    borderWidth: 2,
                    fill: true,
                    tension: 0.4,
                    pointBackgroundColor: '#6366f1', // indigo-500
                    pointBorderColor: '#1e293b', // slate-800
                    pointHoverBackgroundColor: '#fff',
                    pointHoverBorderColor: '#6366f1',
                    pointRadius: 4,
                    pointHoverRadius: 6
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        backgroundColor: '#1e293b',
                        titleColor: '#f1f5f9',
                        bodyColor: '#f1f5f9',
                        padding: 10,
                        displayColors: false,
                        cornerRadius: 8,
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        grid: { color: '#334155', drawBorder: false }, // slate-700
                        ticks: { color: '#94a3b8', precision: 0 } // slate-400
                    },
                    x: {
                        grid: { display: false, drawBorder: false },
                        ticks: { color: '#94a3b8' } // slate-400
                    }
                }
            }
        });
    } catch (error) {
        console.error("Grafik verileri çekilemedi:", error);
    }
}

// --- ADMİN TAKVİM SİSTEMİ (Seçim ve Görüntüleme) ---
let currentAdminMonth = new Date().getMonth();
let currentAdminYear = new Date().getFullYear();
let selectedStartDate = null;
let selectedEndDate = null;
let adminHolidaysData = [];

function renderAdminCalendar() {
    const monthYearEl = document.getElementById('admin-calendar-month-year');
    const gridEl = document.getElementById('admin-calendar-grid');
    if (!monthYearEl || !gridEl) return;

    const monthNames = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];
    monthYearEl.textContent = `${monthNames[currentAdminMonth]} ${currentAdminYear}`;
    
    gridEl.innerHTML = "";
    
    const firstDay = new Date(currentAdminYear, currentAdminMonth, 1).getDay();
    const daysInMonth = new Date(currentAdminYear, currentAdminMonth + 1, 0).getDate();
    
    let firstDayIndex = firstDay - 1;
    if (firstDayIndex === -1) firstDayIndex = 6;
    
    for (let i = 0; i < firstDayIndex; i++) {
        gridEl.innerHTML += `<div></div>`;
    }
    
    for (let day = 1; day <= daysInMonth; day++) {
        const date = new Date(currentAdminYear, currentAdminMonth, day).getTime();
        
        const m = String(currentAdminMonth + 1).padStart(2, '0');
        const d = String(day).padStart(2, '0');
        const dateStr = `${currentAdminYear}-${m}-${d}`;
        
        let isHolidayDate = false;
        let holidayName = "";
        for (const h of adminHolidaysData) {
            const s = new Date(`${h.start}T00:00:00`).getTime();
            const e = new Date(`${h.end}T23:59:59`).getTime();
            if (date >= s && date <= e) {
                isHolidayDate = true;
                holidayName = h.name;
                break;
            }
        }

        let isSelectedStart = selectedStartDate === dateStr;
        let isSelectedEnd = selectedEndDate === dateStr;
        let isInRange = false;

        if (selectedStartDate && selectedEndDate) {
            const s = new Date(selectedStartDate).getTime();
            const e = new Date(selectedEndDate).getTime();
            if (date > s && date < e) isInRange = true;
        }

        let dayClass = "w-8 h-8 sm:w-10 sm:h-10 mx-auto flex items-center justify-center rounded-lg text-sm transition-all cursor-pointer relative font-medium ";
        
        if (isSelectedStart || isSelectedEnd) {
            dayClass += "bg-indigo-600 text-white shadow-md shadow-indigo-500/30 scale-110 z-10 border-2 border-indigo-400";
        } else if (isInRange) {
            dayClass += "bg-indigo-500/20 text-indigo-300";
        } else if (isHolidayDate) {
            dayClass += "bg-rose-500/20 text-rose-300 border border-rose-500/30";
        } else {
            dayClass += "text-slate-300 hover:bg-slate-700";
        }

        const tooltipHTML = isHolidayDate ? `<div class="absolute bottom-full mb-1 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity bg-slate-900 text-white text-[10px] px-2 py-1 rounded shadow-lg pointer-events-none whitespace-nowrap z-50">${holidayName}</div>` : '';

        gridEl.innerHTML += `<div class="py-1 relative group"><div class="${dayClass}" data-date="${dateStr}">${day}</div>${tooltipHTML}</div>`;
    }

    gridEl.querySelectorAll('[data-date]').forEach(el => {
        el.addEventListener('click', (e) => {
            handleDateClick(e.target.getAttribute('data-date'));
        });
    });
}

function handleDateClick(dateStr) {
    // Eğer hiç seçim yoksa veya zaten ikisi de seçiliyse (yeni baştan)
    if (!selectedStartDate || (selectedStartDate && selectedEndDate)) {
        selectedStartDate = dateStr;
        selectedEndDate = null;
    } else {
        const s = new Date(selectedStartDate).getTime();
        const c = new Date(dateStr).getTime();
        
        if (c < s) {
            selectedStartDate = dateStr; // Geriye doğru seçilirse başlangıcı değiştir
        } else {
            selectedEndDate = dateStr;
            calculateDuration(selectedStartDate, selectedEndDate);
        }
    }
    
    // Form alanlarına yansıt
    document.getElementById("h-start").value = selectedStartDate || "";
    document.getElementById("h-end").value = selectedEndDate || selectedStartDate || ""; 
    
    if(!selectedEndDate && selectedStartDate) {
        document.getElementById("h-end").value = selectedStartDate; // Tek günlük tatil seçimi
        calculateDuration(selectedStartDate, selectedStartDate);
    }

    renderAdminCalendar();
}

function calculateDuration(startStr, endStr) {
    const s = new Date(startStr);
    const e = new Date(endStr);
    const diffTime = Math.abs(e - s);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1; // Başlangıç günü dahil edilir
    document.getElementById("h-duration").value = `${diffDays} Gün`;
}

// --- MODERN BİLDİRİM (TOAST) SİSTEMİ ---
function showToast(message, type = "error") {
    const toastContainer = document.getElementById("toast-container");
    if (!toastContainer) return;

    const toast = document.createElement("div");
    toast.className = "flex items-center gap-3 px-4 py-3 rounded-xl shadow-xl transform translate-x-full opacity-0 transition-all duration-300 w-80 pointer-events-auto border backdrop-blur-md";
    
    let iconHtml = '';
    if (type === "error") {
        toast.classList.add("bg-rose-900/90", "border-rose-700/50", "text-rose-100", "shadow-rose-900/20");
        iconHtml = `<svg class="w-5 h-5 shrink-0 text-rose-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>`;
    } else if (type === "success") {
        toast.classList.add("bg-emerald-900/90", "border-emerald-700/50", "text-emerald-100", "shadow-emerald-900/20");
        iconHtml = `<svg class="w-5 h-5 shrink-0 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path></svg>`;
    } else if (type === "warning") {
        toast.classList.add("bg-amber-900/90", "border-amber-700/50", "text-amber-100", "shadow-amber-900/20");
        iconHtml = `<svg class="w-5 h-5 shrink-0 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg>`;
    }

    toast.innerHTML = `
        ${iconHtml}
        <span class="text-sm font-medium leading-tight">${message}</span>
    `;

    toastContainer.appendChild(toast);

    // İçeri giriş animasyonu
    setTimeout(() => toast.classList.remove("translate-x-full", "opacity-0"), 10);

    // 4 saniye sonra kaybolma animasyonu ve elementi silme
    setTimeout(() => {
        toast.classList.add("opacity-0", "translate-x-full");
        setTimeout(() => toast.remove(), 300);
    }, 4000);
}

// --- MODERN SİLME MODALI SİSTEMİ ---
const deleteModal = document.getElementById("delete-modal");
const deleteBackdrop = document.getElementById("delete-modal-backdrop");
const deleteContent = document.getElementById("delete-modal-content");
const cancelDeleteBtn = document.getElementById("cancel-delete-btn");
const confirmDeleteBtn = document.getElementById("confirm-delete-btn");
const confirmDeleteText = document.getElementById("confirm-delete-text");
const confirmDeleteSpinner = document.getElementById("confirm-delete-spinner");

let holidayIdToDelete = null;
let deleteTargetButton = null;

function openDeleteModal(id, btnElement) {
    holidayIdToDelete = id;
    deleteTargetButton = btnElement;
    
    deleteModal.classList.remove("hidden");
    deleteModal.classList.add("flex");
    
    setTimeout(() => {
        deleteBackdrop.classList.remove("opacity-0");
        deleteBackdrop.classList.add("opacity-100");
        deleteContent.classList.remove("scale-95", "opacity-0");
        deleteContent.classList.add("scale-100", "opacity-100");
    }, 10);
}

function closeDeleteModal() {
    deleteBackdrop.classList.remove("opacity-100");
    deleteBackdrop.classList.add("opacity-0");
    deleteContent.classList.remove("scale-100", "opacity-100");
    deleteContent.classList.add("scale-95", "opacity-0");
    
    setTimeout(() => {
        deleteModal.classList.add("hidden");
        deleteModal.classList.remove("flex");
        holidayIdToDelete = null;
        deleteTargetButton = null;
        
        // Form durumunu sıfırla
        confirmDeleteBtn.disabled = false;
        confirmDeleteText.textContent = "Evet, Sil";
        confirmDeleteSpinner.classList.add("hidden");
        confirmDeleteBtn.classList.remove("cursor-not-allowed", "opacity-75");
    }, 300);
}

if (cancelDeleteBtn) cancelDeleteBtn.addEventListener("click", closeDeleteModal);

if (confirmDeleteBtn) {
    confirmDeleteBtn.addEventListener("click", async () => {
        if (!holidayIdToDelete) return;
        try {
            confirmDeleteBtn.disabled = true;
            confirmDeleteBtn.classList.add("cursor-not-allowed", "opacity-75");
            confirmDeleteText.textContent = "Siliniyor...";
            confirmDeleteSpinner.classList.remove("hidden");
            if (deleteTargetButton) deleteTargetButton.disabled = true;
            
            await deleteDoc(doc(db, "custom_holidays", holidayIdToDelete));
            showToast("Tatil başarıyla silindi.", "success");
            closeDeleteModal();
        } catch (error) {
            showToast("Tatil silinirken bir hata oluştu.", "error");
            console.error(error);
            closeDeleteModal();
            if (deleteTargetButton) deleteTargetButton.disabled = false;
        }
    });
}

// Şifre Göster/Gizle Mantığı
const togglePasswordBtn = document.getElementById("toggle-password");
const passwordInput = document.getElementById("password");
const eyeIcon = document.getElementById("eye-icon");
const eyeSlashIcon = document.getElementById("eye-slash-icon");
if (togglePasswordBtn) {
    togglePasswordBtn.addEventListener("click", () => {
        const isPassword = passwordInput.type === "password";
        passwordInput.type = isPassword ? "text" : "password";
        eyeIcon.classList.toggle("hidden", isPassword);
        eyeSlashIcon.classList.toggle("hidden", !isPassword);
    });
}

// Güvenlik için sekme kapatıldığında oturumu sonlandırma (Opsiyonel)
setPersistence(auth, browserSessionPersistence).catch(console.error);

// Hareketsizlik (Inactivity) Zamanlayıcısı
let inactivityTimer;
const INACTIVITY_LIMIT = 30 * 60 * 1000; // 30 dakika (Milisaniye cinsinden)

function resetInactivityTimer() {
    clearTimeout(inactivityTimer);
    if (auth.currentUser) {
        inactivityTimer = setTimeout(() => {
            showToast("Uzun süre işlem yapmadığınız için güvenliğiniz gereği oturumunuz sonlandırıldı.", "warning");
            signOut(auth);
        }, INACTIVITY_LIMIT);
    }
}

// Kullanıcı fareyi oynattığında veya tuşa bastığında süreyi sıfırla
window.addEventListener('mousemove', resetInactivityTimer);
window.addEventListener('keypress', resetInactivityTimer);
window.addEventListener('click', resetInactivityTimer);

// Oturum Durumunu Dinleme
onAuthStateChanged(auth, async (user) => {
    if (user) {
        loginSection.classList.add("hidden");
        adminSection.classList.remove("hidden");
        
        await fetchSystemHolidays();

        if (!holidaysCollectionUnsubscribe) {
            holidaysCollectionUnsubscribe = onSnapshot(collection(db, "custom_holidays"), (snapshot) => {
                const hols = [];
                snapshot.forEach((doc) => {
                    hols.push({ id: doc.id, ...doc.data() });
                });
                firebaseHolidaysData = hols;
                
                const filteredSystemHolidays = systemHolidaysData.filter(sysHol => {
                    return !firebaseHolidaysData.some(fHol => fHol.start === sysHol.start || fHol.originalStart === sysHol.start);
                });

                adminHolidaysData = [...filteredSystemHolidays, ...firebaseHolidaysData];
                renderHolidays(adminHolidaysData);
                renderAdminCalendar();
            });
        }

        // Ziyaretçi İstatistiklerini Canlı Çek
        const todayStr = new Date().toISOString().split('T')[0];
        visitorUnsubscribe = onSnapshot(doc(db, "site_stats", "visitors"), (docSnap) => {
            const el = document.getElementById("stat-total-visitors");
            if (el) el.textContent = docSnap.exists() ? docSnap.data().count.toLocaleString('tr-TR') : "0";
        });
        dailyVisitorUnsubscribe = onSnapshot(doc(db, "site_stats", `daily_${todayStr}`), (docSnap) => {
            const count = docSnap.exists() ? docSnap.data().count : 0;
            const el = document.getElementById("stat-today-visitors");
            if (el) el.textContent = count.toLocaleString('tr-TR');
            
            // Grafiğin son gününü canlı güncelle
            if (visitorChart && visitorChart.data && visitorChart.data.datasets[0].data.length === 7) {
                visitorChart.data.datasets[0].data[6] = count;
                visitorChart.update();
            }
        });

        // Bildirim Abonesi sayısını canlı çek
        subscribersUnsubscribe = onSnapshot(collection(db, "fcm_tokens"), (snapshot) => {
            const el = document.getElementById("stat-subscribers");
            if (el) el.textContent = snapshot.size.toLocaleString('tr-TR');
        });

        loadChartData(); // Grafiği yükle
        resetInactivityTimer(); // Giriş yapıldığında süreyi başlat
    } else {
        loginSection.classList.remove("hidden");
        adminSection.classList.add("hidden");
            // Çıkış yapıldığında veritabanı dinlemesini durdur
            if (holidaysCollectionUnsubscribe) {
                holidaysCollectionUnsubscribe();
                holidaysCollectionUnsubscribe = null;
            }
            if (visitorUnsubscribe) {
                visitorUnsubscribe();
                visitorUnsubscribe = null;
            }
            if (dailyVisitorUnsubscribe) {
                dailyVisitorUnsubscribe();
                dailyVisitorUnsubscribe = null;
            }
        if (subscribersUnsubscribe) {
            subscribersUnsubscribe();
            subscribersUnsubscribe = null;
        }
        if (visitorChart) {
            visitorChart.destroy();
            visitorChart = null;
        }
        clearTimeout(inactivityTimer); // Çıkış yapıldığında sayacı durdur
    }
});

function renderHolidays(holidays) {
    currentHolidaysList.innerHTML = "";
    
    const todayTime = new Date().setHours(0,0,0,0);

    // --- İSTATİSTİK GÜNCELLEMESİ ---
    const allHolidays = adminHolidaysData;
    let totalCount = allHolidays.length;
    let globalUpcoming = allHolidays.filter(h => new Date(h.end).getTime() >= todayTime);
    globalUpcoming.sort((a,b) => new Date(a.start).getTime() - new Date(b.start).getTime());
    
    const statTotalEl = document.getElementById("stat-total");
    const statUpcomingEl = document.getElementById("stat-upcoming");
    const statNextEl = document.getElementById("stat-next");
    
    if(statTotalEl) statTotalEl.textContent = totalCount;
    if(statUpcomingEl) statUpcomingEl.textContent = globalUpcoming.length;

    // --- ARAMA MANTIĞI ---
    const searchInput = document.getElementById("admin-search-input");
    const searchTerm = searchInput ? searchInput.value.toLowerCase() : "";
    
    let filteredHolidays = holidays.filter(h => h.name.toLowerCase().includes(searchTerm));

    let upcoming = [];
    let past = [];

    filteredHolidays.forEach(h => {
        const endTime = new Date(h.end).getTime();
        if (endTime < todayTime) past.push(h);
        else upcoming.push(h);
    });

    // Yakından uzağa doğru (Yaklaşanlar)
    upcoming.sort((a,b) => new Date(a.start).getTime() - new Date(b.start).getTime());
    // En yakın geçmişten en uzak geçmişe doğru (Geçmiş olanlar listenin altına atılır)
    past.sort((a,b) => new Date(b.start).getTime() - new Date(a.start).getTime());

    let displayHolidays = adminHidePastHolidays ? [...upcoming] : [...upcoming, ...past];

    if (displayHolidays.length === 0) {
        noHolidaysMsg.classList.remove("hidden");
        if (searchTerm) {
            noHolidaysMsg.textContent = `"${searchTerm}" aramasına uygun tatil bulunamadı.`;
        } else {
            noHolidaysMsg.textContent = "Henüz eklenmiş özel tatil bulunmamaktadır.";
        }
        return;
    }
    
    noHolidaysMsg.classList.add("hidden");
    
    displayHolidays.forEach((holiday) => {
        const isPastHoliday = new Date(holiday.end).getTime() < todayTime;
        const opacityClass = isPastHoliday ? "opacity-60 grayscale hover:grayscale-0" : "";
        
        const div = document.createElement("div");
        div.className = `flex flex-col sm:flex-row gap-3 justify-between sm:items-center bg-slate-800/80 border border-slate-600/50 p-3.5 rounded-xl hover:border-slate-500 transition-all group ${opacityClass}`;
        
        let actionButtons = "";
        if (holiday.isSystem) {
            actionButtons = `
                <div class="flex gap-2 shrink-0">
                    <button data-id="${holiday.id}" data-type="system" class="edit-btn px-3 py-1.5 text-xs font-semibold text-amber-400 bg-amber-500/10 hover:bg-amber-500 hover:text-white border border-amber-500/20 rounded-lg transition-all shadow-sm" title="Bu tatili değiştirerek özelleştirin">Özelleştir</button>
                </div>
            `;
        } else {
            actionButtons = `
                <div class="flex gap-2 shrink-0">
                    <button data-id="${holiday.id}" data-type="custom" class="edit-btn px-3 py-1.5 text-xs font-semibold text-indigo-400 bg-indigo-500/10 hover:bg-indigo-500 hover:text-white border border-indigo-500/20 rounded-lg transition-all shadow-sm">Düzenle</button>
                    <button data-id="${holiday.id}" class="delete-btn px-3 py-1.5 text-xs font-semibold text-rose-400 bg-rose-500/10 hover:bg-rose-500 hover:text-white border border-rose-500/20 rounded-lg transition-all shadow-sm">Sil</button>
                </div>
            `;
        }

        div.innerHTML = `
            <div>
                <h4 class="font-bold text-slate-100 text-sm mb-0.5 flex items-center gap-2">
                    ${holiday.name} 
                    ${holiday.isSystem ? '<span class="text-[9px] bg-slate-700 text-slate-300 px-1.5 py-0.5 rounded tracking-wide">SİSTEM</span>' : ''}
                    ${isPastHoliday ? '<span class="text-[9px] bg-rose-900/80 text-rose-300 px-1.5 py-0.5 rounded tracking-wide border border-rose-700/50">GEÇMİŞ</span>' : ''}
                </h4>
                <div class="flex flex-wrap items-center gap-2 text-xs text-slate-400">
                    <span class="inline-block w-2 h-2 rounded-full ${holiday.type === 'meb' ? 'bg-indigo-400' : 'bg-rose-400'}"></span>
                    <span class="font-medium">${holiday.start} / ${holiday.end}</span>
                    <span class="text-slate-500">(${holiday.duration})</span>
                </div>
            </div>
            ${actionButtons}
        `;
        currentHolidaysList.appendChild(div);
    });

    // Düzenleme / Özelleştirme Olayları
    document.querySelectorAll(".edit-btn").forEach((btn) => {
        btn.addEventListener("click", (e) => {
            const id = e.target.getAttribute("data-id");
            const type = e.target.getAttribute("data-type");
            
            let holiday = null;
            if (type === "system") {
                holiday = systemHolidaysData.find(h => h.id === id);
                editHolidayId = null; // Özelleştir dediğimizde Firebase'e "Yeni" olarak ekler (Üzerine yazar)
                overrideSystemStart = holiday.start; // Sistem tatilini ezdiğimiz için orijinal tarihini tut
            } else {
                holiday = firebaseHolidaysData.find(h => h.id === id);
                editHolidayId = id; // Güncelleme işlemi
                overrideSystemStart = holiday.originalStart || null; // Varsa orijinal tarihi koru
            }

            if (holiday) {
                document.getElementById("h-name").value = holiday.name;
                document.getElementById("h-start").value = holiday.start;
                document.getElementById("h-end").value = holiday.end;
                document.getElementById("h-duration").value = holiday.duration;
                document.getElementById("h-type").value = holiday.type;

                selectedStartDate = holiday.start;
                selectedEndDate = holiday.end;
                renderAdminCalendar();

                document.getElementById("add-holiday-form").scrollIntoView({behavior: "smooth"});
                const submitSpan = document.querySelector("#add-holiday-form button[type='submit'] span");
                if (submitSpan) {
                    submitSpan.textContent = editHolidayId ? "Tatili Güncelle" : "Yeni Olarak Kaydet (Sistemin Üzerine Yaz)";
                }
            }
        });
    });

    // Silme Olayları
    document.querySelectorAll(".delete-btn").forEach((btn) => {
        btn.addEventListener("click", (e) => {
            const id = e.target.getAttribute("data-id");
            openDeleteModal(id, e.target);
        });
    });
}

// Geçmiş Tatilleri Gizleme Toggle Olayı
const adminFilterPastToggle = document.getElementById('admin-filter-past');
if (adminFilterPastToggle) {
    adminFilterPastToggle.checked = adminHidePastHolidays;
    adminFilterPastToggle.addEventListener('change', (e) => {
        adminHidePastHolidays = e.target.checked;
        localStorage.setItem('admin-hide-past', adminHidePastHolidays);
        renderHolidays(adminHolidaysData);
    });
}

// Arama Barı Olayı
const adminSearchInput = document.getElementById('admin-search-input');
if (adminSearchInput) {
    adminSearchInput.addEventListener('input', () => {
        renderHolidays(adminHolidaysData);
    });
}

// Admin Girişi
loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = document.getElementById("email").value;
    const password = document.getElementById("password").value;
    const errorContainer = document.getElementById("login-error-container");
    const errorText = document.getElementById("login-error-text");

    // Butonu devre dışı bırak, spinner'ı göster
    loginButton.disabled = true;
    loginButton.classList.add("opacity-75", "cursor-not-allowed");
    loginButtonText.classList.add("hidden");
    loginSpinner.classList.remove("hidden");
    errorContainer.classList.add("hidden");
    
    try {
        await signInWithEmailAndPassword(auth, email, password);
        loginForm.reset();
    } catch (error) {
        let errorMsg = "Giriş başarısız. Bir hata oluştu.";
        if (error.code === 'auth/invalid-credential' || error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password') {
            errorMsg = "E-posta veya şifre hatalı. Lütfen kontrol edin.";
        } else if (error.code === 'auth/too-many-requests') {
            errorMsg = "Çok fazla başarısız deneme yapıldı. Lütfen daha sonra tekrar deneyin.";
        } else if (error.code === 'auth/invalid-email') {
            errorMsg = "Lütfen geçerli bir e-posta adresi girin.";
        }
        
        errorText.textContent = errorMsg;
        errorContainer.classList.remove("hidden");
        
        // Hata animasyonunu tetikle (Shake efekti)
        loginSection.classList.remove("animate-shake");
        void loginSection.offsetWidth; // Reflow tetikle
        loginSection.classList.add("animate-shake");
    } finally {
        // Butonu tekrar etkinleştir, spinner'ı gizle
        loginButton.disabled = false;
        loginButton.classList.remove("opacity-75", "cursor-not-allowed");
        loginButtonText.classList.remove("hidden");
        loginSpinner.classList.add("hidden");
    }
});

// Admin Çıkışı
logoutBtn.addEventListener("click", () => signOut(auth));

// Yeni Tatil Ekleme
addHolidayForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = addHolidayForm.querySelector("button[type='submit']");
    const submitSpan = btn.querySelector("span") || btn;
    
    btn.disabled = true;
    const originalText = submitSpan.textContent;
    submitSpan.textContent = "Kaydediliyor...";

    const newHoliday = {
        name: document.getElementById("h-name").value,
        start: document.getElementById("h-start").value,
        end: document.getElementById("h-end").value,
        duration: document.getElementById("h-duration").value,
        type: document.getElementById("h-type").value
    };
    
    if (overrideSystemStart) {
        newHoliday.originalStart = overrideSystemStart;
    }

    try {
        if (editHolidayId) {
            await updateDoc(doc(db, "custom_holidays", editHolidayId), newHoliday);
            showToast("Tatil başarıyla güncellendi!", "success");
            editHolidayId = null;
        } else {
            await addDoc(collection(db, "custom_holidays"), newHoliday);
            showToast("Tatil başarıyla kaydedildi!", "success");
        }
        addHolidayForm.reset();
        selectedStartDate = null;
        selectedEndDate = null;
        overrideSystemStart = null;
        renderAdminCalendar(); // Takvimi de temizle
    } catch (error) {
        showToast("Veri eklenirken hata oluştu: Firebase bağlantınızı kontrol edin.", "error");
        console.error(error);
    } finally {
        btn.disabled = false;
        submitSpan.textContent = "Tatili Kaydet ve Yayınla";
    }
});

addHolidayForm.addEventListener("reset", () => {
    editHolidayId = null;
    overrideSystemStart = null;
    const submitSpan = addHolidayForm.querySelector("button[type='submit'] span");
    if (submitSpan) submitSpan.textContent = "Tatili Kaydet ve Yayınla";
});

// --- BİLDİRİM (PUSH) GÖNDERME İSTEĞİ ---
const sendPushBtn = document.getElementById('send-push-btn');
if (sendPushBtn) {
    sendPushBtn.addEventListener('click', async () => {
        if(!confirm("DİKKAT: Sitedeki tüm kullanıcılara anlık bildirim gidecek! Onaylıyor musunuz?")) return;

        const originalText = sendPushBtn.innerHTML;
        sendPushBtn.disabled = true;
        sendPushBtn.textContent = "Gönderiliyor...";

        try {
            await addDoc(collection(db, "notification_requests"), {
                title: "🔔 SON DAKİKA: Tatil Duyurusu!",
                body: "Yarın okullar tatil edildi. Detaylar ve güncel takvim için hemen tıklayın!",
                timestamp: new Date().toISOString(),
                status: "pending"
            });
            showToast("Bildirim sıraya alındı! (Cloud Function gerektirir)", "success");
        } catch (err) {
            showToast("Bildirim isteği oluşturulamadı.", "error");
        } finally {
            sendPushBtn.disabled = false;
            sendPushBtn.innerHTML = originalText;
        }
    });
}

// --- TAKVİM VE FORM SENKRONİZASYON OLAYLARI ---
const adminPrevMonthBtn = document.getElementById('admin-prev-month');
const adminNextMonthBtn = document.getElementById('admin-next-month');
const hStartInput = document.getElementById("h-start");
const hEndInput = document.getElementById("h-end");

if (adminPrevMonthBtn) adminPrevMonthBtn.addEventListener('click', () => {
    currentAdminMonth--;
    if (currentAdminMonth < 0) { currentAdminMonth = 11; currentAdminYear--; }
    renderAdminCalendar();
});

if (adminNextMonthBtn) adminNextMonthBtn.addEventListener('click', () => {
    currentAdminMonth++;
    if (currentAdminMonth > 11) { currentAdminMonth = 0; currentAdminYear++; }
    renderAdminCalendar();
});

// Inputlardan elle tarih girilirse takvimi ona göre boya
if (hStartInput) hStartInput.addEventListener("change", (e) => { 
    selectedStartDate = e.target.value; 
    if(selectedEndDate && new Date(selectedStartDate) > new Date(selectedEndDate)) {
        selectedEndDate = selectedStartDate;
        hEndInput.value = selectedStartDate;
    }
    if(selectedStartDate && selectedEndDate) calculateDuration(selectedStartDate, selectedEndDate);
    renderAdminCalendar(); 
});
if (hEndInput) hEndInput.addEventListener("change", (e) => { 
    selectedEndDate = e.target.value; 
    if(selectedStartDate && new Date(selectedStartDate) > new Date(selectedEndDate)) {
        selectedStartDate = selectedEndDate;
        hStartInput.value = selectedEndDate;
    }
    if(selectedStartDate && selectedEndDate) calculateDuration(selectedStartDate, selectedEndDate);
    renderAdminCalendar(); 
});

// --- SEKME (TAB) GEÇİŞLERİ ---
const tabHolidays = document.getElementById("tab-holidays");
const tabStats = document.getElementById("tab-stats");
const sectionHolidays = document.getElementById("section-holidays");
const sectionStats = document.getElementById("section-stats");

if (tabHolidays && tabStats) {
    tabHolidays.addEventListener("click", () => {
        tabHolidays.className = "pb-3 text-sm font-semibold text-indigo-400 border-b-2 border-indigo-400 focus:outline-none transition-all";
        tabStats.className = "pb-3 text-sm font-semibold text-slate-400 hover:text-slate-200 border-b-2 border-transparent hover:border-slate-600 focus:outline-none transition-all";
        
        sectionHolidays.classList.remove("hidden");
        sectionStats.classList.add("hidden");
    });

    tabStats.addEventListener("click", () => {
        tabStats.className = "pb-3 text-sm font-semibold text-indigo-400 border-b-2 border-indigo-400 focus:outline-none transition-all";
        tabHolidays.className = "pb-3 text-sm font-semibold text-slate-400 hover:text-slate-200 border-b-2 border-transparent hover:border-slate-600 focus:outline-none transition-all";
        
        sectionStats.classList.remove("hidden");
        sectionHolidays.classList.add("hidden");
    });
}

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
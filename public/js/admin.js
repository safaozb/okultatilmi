import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, onAuthStateChanged, signOut, setPersistence, browserSessionPersistence, updateProfile } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getFirestore, collection, addDoc, deleteDoc, doc, updateDoc, onSnapshot, getDoc, query, orderBy, setDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
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
let hourlyChart = null;
let miniVisitorChart = null;
let subscribersUnsubscribe = null;
let announcementUnsubscribe = null;
let siteNotificationsUnsubscribe = null;

// Tüm şehirler listesi (Genel kullanım için en üste alındı)
const citiesList = ["Adana", "Adıyaman", "Afyonkarahisar", "Ağrı", "Amasya", "Ankara", "Antalya", "Artvin", "Aydın", "Balıkesir", "Bilecik", "Bingöl", "Bitlis", "Bolu", "Burdur", "Bursa", "Çanakkale", "Çankırı", "Çorum", "Denizli", "Diyarbakır", "Edirne", "Elazığ", "Erzincan", "Erzurum", "Eskişehir", "Gaziantep", "Giresun", "Gümüşhane", "Hakkâri", "Hatay", "Isparta", "Mersin", "İstanbul", "İzmir", "Kars", "Kastamonu", "Kayseri", "Kırklareli", "Kırşehir", "Kocaeli", "Konya", "Kütahya", "Malatya", "Manisa", "Kahramanmaraş", "Mardin", "Muğla", "Muş", "Nevşehir", "Niğde", "Ordu", "Rize", "Sakarya", "Samsun", "Siirt", "Sinop", "Sivas", "Tekirdağ", "Tokat", "Trabzon", "Tunceli", "Şanlıurfa", "Uşak", "Van", "Yozgat", "Zonguldak", "Aksaray", "Bayburt", "Karaman", "Kırıkkale", "Batman", "Şırnak", "Bartın", "Ardahan", "Iğdır", "Yalova", "Karabük", "Kilis", "Osmaniye", "Düzce"];

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

// --- ŞEHİR SEÇİMİ (DROPDOWN DOLDURMA) ---
const pushCitySelect = document.getElementById('push-city');
if (pushCitySelect && typeof citiesList !== 'undefined') {
    citiesList.forEach(city => {
        const opt = document.createElement('option');
        opt.value = city;
        opt.textContent = city;
        pushCitySelect.appendChild(opt);
    });
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
                    borderColor: '#94a3b8', // slate-400
                    backgroundColor: 'rgba(148, 163, 184, 0.15)',
                    borderWidth: 2,
                    fill: true,
                    tension: 0.4,
                    pointBackgroundColor: '#64748b', // slate-500
                    pointBorderColor: '#1e293b', 
                    pointHoverBackgroundColor: '#fff',
                    pointHoverBorderColor: '#94a3b8',
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
        
        // Mini Grafik (Ana Sayfa İçin)
        const miniCtx = document.getElementById('mini-visitor-chart');
        if (miniCtx) {
            if (miniVisitorChart) miniVisitorChart.destroy();
            miniVisitorChart = new Chart(miniCtx, {
                type: 'line',
                data: {
                    labels: labels,
                    datasets: [{
                        label: 'Ziyaretçi',
                        data: data,
                        borderColor: '#818cf8', // indigo-400
                        backgroundColor: 'rgba(129, 140, 248, 0.15)',
                        borderWidth: 2,
                        fill: true,
                        tension: 0.4,
                        pointRadius: 0,
                        pointHoverRadius: 4,
                        pointBackgroundColor: '#818cf8'
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: { legend: { display: false }, tooltip: { backgroundColor: '#1e293b', titleColor: '#f1f5f9', bodyColor: '#f1f5f9', cornerRadius: 6, displayColors: false } },
                    scales: { y: { display: false, beginAtZero: true }, x: { display: false } },
                    interaction: { intersect: false, mode: 'index' }
                }
            });
        }
    } catch (error) {
        console.error("Grafik verileri çekilemedi:", error);
    }
}

// --- SAATLİK GRAFİK (CHART.JS) SİSTEMİ ---
async function loadHourlyChartData() {
    const labels = Array.from({ length: 24 }, (_, i) => `${String(i).padStart(2, '0')}:00`);
    const data = new Array(24).fill(0);
    const todayStr = new Date().toISOString().split('T')[0];
    const promises = [];

    // 24 saatin verilerini asenkron olarak paralel çekiyoruz
    for (let i = 0; i < 24; i++) {
        promises.push(getDoc(doc(db, "site_stats", `hourly_${todayStr}_${i}`)));
    }

    try {
        const results = await Promise.all(promises);
        results.forEach((snap, i) => {
            data[i] = snap.exists() ? snap.data().count : 0;
        });

        const ctx = document.getElementById('hourly-visitor-chart');
        if (!ctx) return;

        if (hourlyChart) {
            hourlyChart.destroy();
        }

        hourlyChart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Ziyaretçi Sayısı',
                    data: data,
                    backgroundColor: '#64748b', // slate-500
                    hoverBackgroundColor: '#94a3b8', // slate-400
                    borderRadius: 6,
                    borderWidth: 0,
                    barPercentage: 0.7
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
                        callbacks: {
                            title: function(context) {
                                return `${context[0].label} - ${String(parseInt(context[0].label) + 1).padStart(2, '0')}:00 Arası`;
                            }
                        }
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        grid: { color: '#334155', drawBorder: false },
                        ticks: { color: '#94a3b8', precision: 0 }
                    },
                    x: {
                        grid: { display: false, drawBorder: false },
                        ticks: { color: '#94a3b8', maxRotation: 45, minRotation: 0 }
                    }
                }
            }
        });
    } catch (error) {
        console.error("Saatlik grafik verileri çekilemedi:", error);
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
        let holidayType = "";
        for (const h of adminHolidaysData) {
            const s = new Date(`${h.start}T00:00:00`).getTime();
            const e = new Date(`${h.end}T23:59:59`).getTime();
            if (date >= s && date <= e) {
                isHolidayDate = true;
                holidayName = h.name;
                holidayType = h.type;
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
            dayClass += "bg-slate-600 text-white shadow-md shadow-black/20 scale-110 z-10 border-2 border-slate-400";
        } else if (isInRange) {
            dayClass += "bg-slate-700/50 text-slate-300";
        } else if (isHolidayDate) {
            if (holidayType === 'meb') {
                dayClass += "bg-indigo-500/20 border border-indigo-500/50 text-indigo-300";
            } else {
                dayClass += "bg-sky-500/20 border border-sky-500/50 text-sky-300";
            }
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

// --- BİLDİRİM SİLME MODALI SİSTEMİ ---
const deleteNotificationModal = document.getElementById("delete-notification-modal");
const deleteNotificationBackdrop = document.getElementById("delete-notification-modal-backdrop");
const deleteNotificationContent = document.getElementById("delete-notification-modal-content");
const cancelDeleteNotificationBtn = document.getElementById("cancel-delete-notification-btn");
const confirmDeleteNotificationBtn = document.getElementById("confirm-delete-notification-btn");
const confirmDeleteNotificationText = document.getElementById("confirm-delete-notification-text");
const confirmDeleteNotificationSpinner = document.getElementById("confirm-delete-notification-spinner");

let notificationIdToDelete = null;
let deleteNotificationTargetBtn = null;

function openDeleteNotificationModal(id, btnElement) {
    notificationIdToDelete = id;
    deleteNotificationTargetBtn = btnElement;
    deleteNotificationModal.classList.remove("hidden");
    deleteNotificationModal.classList.add("flex");
    setTimeout(() => {
        deleteNotificationBackdrop.classList.remove("opacity-0");
        deleteNotificationBackdrop.classList.add("opacity-100");
        deleteNotificationContent.classList.remove("scale-95", "opacity-0");
        deleteNotificationContent.classList.add("scale-100", "opacity-100");
    }, 10);
}

function closeDeleteNotificationModal() {
    deleteNotificationBackdrop.classList.remove("opacity-100");
    deleteNotificationBackdrop.classList.add("opacity-0");
    deleteNotificationContent.classList.remove("scale-100", "opacity-100");
    deleteNotificationContent.classList.add("scale-95", "opacity-0");
    setTimeout(() => {
        deleteNotificationModal.classList.add("hidden");
        deleteNotificationModal.classList.remove("flex");
        notificationIdToDelete = null;
        deleteNotificationTargetBtn = null;
        confirmDeleteNotificationBtn.disabled = false;
        confirmDeleteNotificationText.textContent = "Evet, Kaldır";
        confirmDeleteNotificationSpinner.classList.add("hidden");
        confirmDeleteNotificationBtn.classList.remove("cursor-not-allowed", "opacity-75");
    }, 300);
}

if (cancelDeleteNotificationBtn) cancelDeleteNotificationBtn.addEventListener("click", closeDeleteNotificationModal);

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
        
        // Hoş geldin metnine yöneticinin adını ekleme
        const welcomeNameEl = document.getElementById('admin-welcome-name');
        if (welcomeNameEl) {
            const displayName = user.displayName || user.email.split('@')[0];
            welcomeNameEl.textContent = displayName.charAt(0).toUpperCase() + displayName.slice(1);
        }
        
        // Oturum açıldığında ilk sekme olarak "Ana Sayfa"yı göster
        if (tabHome && sectionHome) switchAdminTab(tabHome, sectionHome);
        
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
            
            const miniEl = document.getElementById("mini-stat-today");
            if (miniEl) miniEl.textContent = count.toLocaleString('tr-TR');
            
            // Grafiğin son gününü canlı güncelle
            if (visitorChart && visitorChart.data && visitorChart.data.datasets[0].data.length === 7) {
                visitorChart.data.datasets[0].data[6] = count;
                visitorChart.update();
            }
            if (miniVisitorChart && miniVisitorChart.data && miniVisitorChart.data.datasets[0].data.length === 7) {
                miniVisitorChart.data.datasets[0].data[6] = count;
                miniVisitorChart.update();
            }
        });

        // Bildirim Abonesi sayısını canlı çek
        subscribersUnsubscribe = onSnapshot(collection(db, "fcm_tokens"), (snapshot) => {
            const el = document.getElementById("stat-subscribers");
            if (el) el.textContent = snapshot.size.toLocaleString('tr-TR');
        });

        // Canlı Duyuru Durumunu Çek
        announcementUnsubscribe = onSnapshot(doc(db, "site_settings", "announcement"), (docSnap) => {
            if (docSnap.exists()) {
                const textEl = document.getElementById('announcement-text');
                const activeEl = document.getElementById('announcement-active');
                const winterEl = document.getElementById('announcement-winter-mode');
                const data = docSnap.data();

                if (textEl) textEl.value = data.text || "";
                if (activeEl) activeEl.checked = data.isActive || false;
                if (winterEl) winterEl.checked = data.isWinterMode || false;
            }
        });

        // Sitedeki Geçmiş Bildirimleri Çek ve Listele
        siteNotificationsUnsubscribe = onSnapshot(query(collection(db, "site_notifications"), orderBy("timestamp", "desc")), (snapshot) => {
            const list = document.getElementById("admin-notifications-list");
            if (!list) return;
            if (snapshot.empty) {
                list.innerHTML = '<p class="text-sm font-medium text-slate-500 text-center py-6">Sitede gösterilen bildirim yok.</p>';
                return;
            }
            list.innerHTML = "";
            snapshot.forEach(docSnap => {
                const data = docSnap.data();
                const cityBadge = data.targetCity && data.targetCity !== 'all' ? `<span class="bg-indigo-500/20 text-indigo-400 px-1.5 py-0.5 rounded text-[10px] ml-2 border border-indigo-500/30">📍 ${data.targetCity}</span>` : `<span class="bg-slate-700 text-slate-300 px-1.5 py-0.5 rounded text-[10px] ml-2">🌍 Tüm Türkiye</span>`;
                list.innerHTML += `
                    <div class="flex justify-between items-start bg-slate-700/30 border border-slate-600/50 p-3 rounded-xl hover:border-slate-500 transition-colors group">
                        <div class="pr-2">
                            <h4 class="text-sm font-bold text-slate-200 flex items-center">${data.title} ${cityBadge}</h4>
                            <p class="text-xs text-slate-400 mt-1 line-clamp-2 leading-relaxed">${data.body}</p>
                            <div class="flex items-center gap-2 mt-2">
                                <span class="text-[10px] text-slate-500 font-medium">${data.dateStr}</span>
                                ${data.senderName ? `<span class="text-[10px] bg-indigo-500/10 text-indigo-400 px-1.5 py-0.5 rounded border border-indigo-500/20 flex items-center gap-1"><svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"></path></svg>${data.senderName}</span>` : ''}
                            </div>
                        </div>
                        <button data-id="${docSnap.id}" class="delete-notification-btn p-2 bg-rose-500/10 hover:bg-rose-500 hover:text-white text-rose-400 rounded-lg transition-colors shrink-0 opacity-100 sm:opacity-0 group-hover:opacity-100" title="Siteden Kaldır">
                            <svg class="w-4 h-4 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                        </button>
                    </div>
                `;
            });
            document.querySelectorAll('.delete-notification-btn').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    const id = e.currentTarget.getAttribute('data-id');
                    openDeleteNotificationModal(id, e.currentTarget);
                });
            });
        });

        if (confirmDeleteNotificationBtn) {
            // Yalnızca admin oturumu açıkken bağlamak için
            // (Bir kere bağlanmasını sağlamak adına dışarıda tanımlayıp id referansıyla tetikletiyoruz)
            confirmDeleteNotificationBtn.onclick = async () => {
                if (!notificationIdToDelete) return;
                confirmDeleteNotificationBtn.disabled = true;
                confirmDeleteNotificationBtn.classList.add("cursor-not-allowed", "opacity-75");
                confirmDeleteNotificationText.textContent = "Kaldırılıyor...";
                confirmDeleteNotificationSpinner.classList.remove("hidden");
                if (deleteNotificationTargetBtn) deleteNotificationTargetBtn.disabled = true;
                
                try {
                    await deleteDoc(doc(db, "site_notifications", notificationIdToDelete));
                    showToast("Bildirim siteden kaldırıldı.", "success");
                    closeDeleteNotificationModal();
                } catch (error) {
                    showToast("Bildirim silinirken bir hata oluştu.", "error");
                    console.error(error);
                    closeDeleteNotificationModal();
                    if (deleteNotificationTargetBtn) deleteNotificationTargetBtn.disabled = false;
                }
            };
        }

        loadChartData(); // Grafiği yükle
        loadHourlyChartData(); // Saatlik grafiği yükle
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
        if (announcementUnsubscribe) {
            announcementUnsubscribe();
            announcementUnsubscribe = null;
        }
        if (siteNotificationsUnsubscribe) {
            siteNotificationsUnsubscribe();
            siteNotificationsUnsubscribe = null;
        }
        if (visitorChart) {
            visitorChart.destroy();
            visitorChart = null;
        }
        if (miniVisitorChart) {
            miniVisitorChart.destroy();
            miniVisitorChart = null;
        }
        if (hourlyChart) {
            hourlyChart.destroy();
            hourlyChart = null;
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
        
        const isMeb = holiday.type === 'meb';
        const dotColor = isMeb ? "bg-indigo-500 shadow-sm shadow-indigo-500/40" : "bg-sky-500 shadow-sm shadow-sky-500/40";
        const borderHoverClass = isMeb ? "hover:border-indigo-500/50" : "hover:border-sky-500/50";
        const typeBadge = isMeb ? '<span class="bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 px-1.5 py-0.5 rounded text-[10px] tracking-wide">Okul Tatili</span>' : '<span class="bg-sky-500/10 text-sky-400 border border-sky-500/20 px-1.5 py-0.5 rounded text-[10px] tracking-wide">Resmi Tatil</span>';

        const div = document.createElement("div");
        div.className = `flex flex-col sm:flex-row gap-3 justify-between sm:items-center bg-slate-800/80 border border-slate-600/50 p-3.5 rounded-xl transition-all group ${borderHoverClass} ${opacityClass}`;
        
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
                    ${holiday.status === 'cancelled' ? '<span class="text-[9px] bg-rose-900/80 text-rose-300 px-1.5 py-0.5 rounded tracking-wide border border-rose-700/50">İPTAL EDİLDİ</span>' : ''}
                    ${holiday.status === 'postponed' ? '<span class="text-[9px] bg-amber-900/80 text-amber-300 px-1.5 py-0.5 rounded tracking-wide border border-amber-700/50">ERTELENDİ</span>' : ''}
                </h4>
                <div class="flex flex-wrap items-center gap-2 text-xs text-slate-400">
                    <span class="inline-block w-2 h-2 rounded-full ${dotColor}"></span>
                    <span class="font-medium">${holiday.start} / ${holiday.end}</span>
                    ${typeBadge}
                    ${holiday.city && holiday.city !== 'genel' ? `<span class="bg-slate-700 text-slate-300 px-2 py-0.5 rounded border border-slate-600">📍 ${holiday.city}</span>` : ''}
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
                // Mevcut vurguyu kaldır, yenisini ekle
                document.querySelectorAll('.is-editing').forEach(el => el.classList.remove('is-editing', 'ring-2', 'ring-slate-500'));
                const listItem = e.target.closest('.group');
                if (listItem) listItem.classList.add('is-editing', 'ring-2', 'ring-slate-500');

                const hName = document.getElementById("h-name");
                const hStart = document.getElementById("h-start");
                const hEnd = document.getElementById("h-end");
                const hDuration = document.getElementById("h-duration");
                const hType = document.getElementById("h-type");
                
                if (hName) hName.value = holiday.name;
                if (hStart) hStart.value = holiday.start;
                if (hEnd) hEnd.value = holiday.end;
                if (hDuration) hDuration.value = holiday.duration;
                if (hType) hType.value = holiday.type;
                if (document.getElementById("h-status")) document.getElementById("h-status").value = holiday.status || "active";
                if (typeof setAdminCityDropdownValue === 'function') {
                    setAdminCityDropdownValue(holiday.city || "genel");
                }

                selectedStartDate = holiday.start;
                selectedEndDate = holiday.end;
                renderAdminCalendar();

                const addForm = document.getElementById("add-holiday-form");
                if (addForm) addForm.scrollIntoView({behavior: "smooth"});
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
const adminSearchClear = document.getElementById('admin-search-clear');
if (adminSearchInput) {
    adminSearchInput.addEventListener('input', () => {
        if (adminSearchClear) adminSearchClear.classList.toggle('hidden', adminSearchInput.value.length === 0);
        renderHolidays(adminHolidaysData);
    });
    if (adminSearchClear) {
        adminSearchClear.addEventListener('click', () => {
            adminSearchInput.value = '';
            adminSearchClear.classList.add('hidden');
            renderHolidays(adminHolidaysData);
        });
    }
}

// Admin Girişi
if (loginForm) {
    loginForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        const email = document.getElementById("email").value;
        const password = document.getElementById("password").value;
        const errorContainer = document.getElementById("login-error-container");
        const errorText = document.getElementById("login-error-text");

        // Tarayıcının varsayılan uyarı baloncuğunu ezip kendi modern hacker uyarımızı (Toast) gösteriyoruz
        if (!email || !email.includes('@') || !password) {
            const emailInput = document.getElementById("email");
            const passwordInput = document.getElementById("password");
            
            loginSection.classList.remove("animate-shake");
            void loginSection.offsetWidth;
            loginSection.classList.add("animate-shake");

            const triggerError = (inputEl, msg) => {
                showToast(msg, "error");
                const group = inputEl.parentElement;
                group.classList.remove("animate-hacker-error");
                void group.offsetWidth;
                group.classList.add("animate-hacker-error");
                inputEl.addEventListener('input', function clearErr() {
                    group.classList.remove("animate-hacker-error");
                    inputEl.removeEventListener('input', clearErr);
                });
            };

            if (!email) return triggerError(emailInput, "Sistem e-postası boş bırakılamaz.");
            if (!email.includes('@')) return triggerError(emailInput, "Geçersiz format: E-posta adresi '@' işareti içermelidir.");
            if (!password) return triggerError(passwordInput, "Erişim anahtarı (şifre) boş bırakılamaz.");
            
            return;
        }

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
            
            // Hacker temalı kırmızı yanıp sönme (Glitch) efekti
            const emailInput = document.getElementById("email");
            const passwordInput = document.getElementById("password");
            if (emailInput && passwordInput) {
                const emailGroup = emailInput.parentElement;
                const passwordGroup = passwordInput.parentElement;
                
                emailGroup.classList.remove("animate-hacker-error");
                passwordGroup.classList.remove("animate-hacker-error");
                void emailGroup.offsetWidth;
                void passwordGroup.offsetWidth;
                emailGroup.classList.add("animate-hacker-error");
                passwordGroup.classList.add("animate-hacker-error");

                // Kullanıcı tekrar yazmaya başladığında kırmızı kilit durumunu kaldır
                const clearHackerError = () => {
                    emailGroup.classList.remove("animate-hacker-error");
                    passwordGroup.classList.remove("animate-hacker-error");
                    emailInput.removeEventListener('input', clearHackerError);
                    passwordInput.removeEventListener('input', clearHackerError);
                };
                emailInput.addEventListener('input', clearHackerError);
                passwordInput.addEventListener('input', clearHackerError);
            }
        } finally {
            // Butonu tekrar etkinleştir, spinner'ı gizle
            loginButton.disabled = false;
            loginButton.classList.remove("opacity-75", "cursor-not-allowed");
            loginButtonText.classList.remove("hidden");
            loginSpinner.classList.add("hidden");
        }
    });
}

// --- EXCEL (CSV) RAPOR İNDİRME SİSTEMİ ---
const exportExcelBtn = document.getElementById('export-excel-btn');
if (exportExcelBtn) {
    exportExcelBtn.addEventListener('click', () => {
        try {
            // 1. Genel İstatistik Kartlarındaki Verileri Al
            const statTotalEl = document.getElementById('stat-total');
            const totalHolidays = statTotalEl ? statTotalEl.textContent.trim() : '0';
            
            const statUpcomingEl = document.getElementById('stat-upcoming');
            const upcomingHolidays = statUpcomingEl ? statUpcomingEl.textContent.trim() : '0';
            
            const statTotalVisEl = document.getElementById('stat-total-visitors');
            const totalVisitors = statTotalVisEl ? statTotalVisEl.textContent.trim().replace(/\./g, '') : '0';
            
            const statTodayVisEl = document.getElementById('stat-today-visitors');
            const todayVisitors = statTodayVisEl ? statTodayVisEl.textContent.trim().replace(/\./g, '') : '0';
            
            const statSubEl = document.getElementById('stat-subscribers');
            const subscribers = statSubEl ? statSubEl.textContent.trim().replace(/\./g, '') : '0';

            let csvContent = "--- GENEL ISTATISTIKLER ---\n";
            csvContent += `Toplam Tatil,${totalHolidays}\n`;
            csvContent += `Yaklasan Tatil,${upcomingHolidays}\n`;
            csvContent += `Toplam Ziyaret,${totalVisitors}\n`;
            csvContent += `Bugunku Ziyaret,${todayVisitors}\n`;
            csvContent += `Bildirim Abonesi,${subscribers}\n\n`;

            // 2. 7 Günlük Ziyaretçi Grafiğinden Verileri Çek
            csvContent += "--- SON 7 GUNLUK ZIYARETCILER ---\n";
            csvContent += "Tarih,Ziyaretci Sayisi\n";
            if (visitorChart && visitorChart.data) {
                const labels = visitorChart.data.labels;
                const data = visitorChart.data.datasets[0].data;
                for (let i = 0; i < labels.length; i++) {
                    csvContent += `${labels[i]},${data[i]}\n`;
                }
            }
            csvContent += "\n";

            // 3. 24 Saatlik Ziyaretçi Grafiğinden Verileri Çek
            csvContent += "--- BUGUNUN SAATLIK ZIYARETCILERI ---\n";
            csvContent += "Saat,Ziyaretci Sayisi\n";
            if (hourlyChart && hourlyChart.data) {
                const labels = hourlyChart.data.labels;
                const data = hourlyChart.data.datasets[0].data;
                for (let i = 0; i < labels.length; i++) {
                    csvContent += `${labels[i]},${data[i]}\n`;
                }
            }

            // 4. Şehirlere Göre Dağılım Listesi
            const cityListItems = document.querySelectorAll('#city-stats-list > div');
            if (cityListItems.length > 0) {
                csvContent += "\n--- SEHRE GORE ABONE DAGILIMI ---\n";
                csvContent += "Sehir,Kisi Sayisi\n";
                cityListItems.forEach(item => {
                    const cityNameEl = item.querySelector('p.font-bold');
                    const countEl = item.querySelector('span.font-black');
                    if (cityNameEl && countEl) {
                        csvContent += `${cityNameEl.textContent},${countEl.textContent}\n`;
                    }
                });
            }

            // UTF-8 BOM ekleyelim ki Excel, varsa Türkçe karakterleri tanısın
            const bom = "\uFEFF";
            const blob = new Blob([bom + csvContent], { type: 'text/csv;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            
            // Sanal bir link oluştur ve dosyayı indir
            const link = document.createElement("a");
            link.setAttribute("href", url);
            link.setAttribute("download", `Site_Raporu_${new Date().toLocaleDateString('tr-TR').replace(/\./g, '_')}.csv`);
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            
            showToast("Excel raporu başarıyla cihazınıza indirildi!", "success");
        } catch (error) {
            console.error("Excel indirme hatası:", error);
            showToast("Rapor oluşturulurken bir hata meydana geldi.", "error");
        }
    });
}

// Admin Çıkışı
if (logoutBtn) {
    logoutBtn.addEventListener("click", () => signOut(auth));
}

// Yeni Tatil Ekleme
if (addHolidayForm) {
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
            type: document.getElementById("h-type").value,
            status: document.getElementById("h-status") ? document.getElementById("h-status").value : "active",
            city: document.getElementById("h-city") ? document.getElementById("h-city").value : "genel"
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
        
        document.querySelectorAll('.is-editing').forEach(el => el.classList.remove('is-editing', 'ring-2', 'ring-slate-500'));

        if (submitSpan) submitSpan.textContent = "Tatili Kaydet ve Yayınla";
        if (typeof setAdminCityDropdownValue === 'function') setAdminCityDropdownValue('genel');
    });
}

// --- BİLDİRİM (PUSH) GÖNDERME İSTEĞİ (MODAL SİSTEMİ) ---
const sendPushBtn = document.getElementById('send-push-btn');
const pushModal = document.getElementById('push-modal');
const pushBackdrop = document.getElementById('push-modal-backdrop');
const pushContent = document.getElementById('push-modal-content');
const cancelPushBtn = document.getElementById('cancel-push-btn');
const confirmPushBtn = document.getElementById('confirm-push-btn');
const pushTitleInput = document.getElementById('push-title');
const pushBodyInput = document.getElementById('push-body');
const confirmPushText = document.getElementById('confirm-push-text');
const confirmPushSpinner = document.getElementById('confirm-push-spinner');

function openPushModal() {
    pushTitleInput.value = "";
    pushBodyInput.value = "";
    if (pushCitySelect) pushCitySelect.value = "all";
    pushModal.classList.remove("hidden");
    pushModal.classList.add("flex");
    
    setTimeout(() => {
        pushBackdrop.classList.remove("opacity-0");
        pushBackdrop.classList.add("opacity-100");
        pushContent.classList.remove("scale-95", "opacity-0");
        pushContent.classList.add("scale-100", "opacity-100");
    }, 10);
}

function closePushModal() {
    pushBackdrop.classList.remove("opacity-100");
    pushBackdrop.classList.add("opacity-0");
    pushContent.classList.remove("scale-100", "opacity-100");
    pushContent.classList.add("scale-95", "opacity-0");
    
    setTimeout(() => {
        pushModal.classList.add("hidden");
        pushModal.classList.remove("flex");
        
        confirmPushBtn.disabled = false;
        confirmPushText.textContent = "Bildirimi Gönder";
        confirmPushSpinner.classList.add("hidden");
        confirmPushBtn.classList.remove("cursor-not-allowed", "opacity-75");
    }, 300);
}

if (sendPushBtn) {
    sendPushBtn.addEventListener('click', openPushModal);
}

if (cancelPushBtn) {
    cancelPushBtn.addEventListener('click', closePushModal);
}

if (confirmPushBtn) {
    confirmPushBtn.addEventListener('click', async () => {
        const title = pushTitleInput.value.trim();
        const body = pushBodyInput.value.trim();

        if (!title || !body) {
            showToast("Lütfen bildirim başlığı ve içeriğini doldurun.", "warning");
            return;
        }

        confirmPushBtn.disabled = true;
        confirmPushBtn.classList.add("cursor-not-allowed", "opacity-75");
        confirmPushText.textContent = "Gönderiliyor...";
        confirmPushSpinner.classList.remove("hidden");

        const pushSendDeviceCheckbox = document.getElementById('push-send-device');
        const sendToDevice = pushSendDeviceCheckbox ? pushSendDeviceCheckbox.checked : true;
        const targetCity = pushCitySelect ? pushCitySelect.value : "all";
        
        const senderName = auth.currentUser ? (auth.currentUser.displayName || auth.currentUser.email.split('@')[0]) : "Yönetici";

        try {
            if (sendToDevice) {
                await addDoc(collection(db, "notification_requests"), {
                    title: title,
                    body: body,
                    targetCity: targetCity,
                    timestamp: new Date().toISOString(),
                    status: "pending",
                    senderName: senderName
                });
            }
            
            // Ana sayfadaki kalıcı listeye (Sitedeki Bildirimler) ekle
            await addDoc(collection(db, "site_notifications"), {
                title: title,
                body: body,
                targetCity: targetCity,
                timestamp: new Date().getTime(),
                dateStr: new Date().toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' }),
                senderName: senderName
            });
            
            showToast(sendToDevice ? "Bildirim cihazlara gönderildi ve siteye eklendi!" : "Bildirim sadece siteye eklendi!", "success");
            closePushModal();
        } catch (err) {
            showToast("Bildirim isteği oluşturulamadı.", "error");
            confirmPushBtn.disabled = false;
            confirmPushBtn.classList.remove("cursor-not-allowed", "opacity-75");
            confirmPushText.textContent = "Bildirimi Gönder";
            confirmPushSpinner.classList.add("hidden");
        }
    });
}

// --- CANLI DUYURU (MARQUEE) KAYDETME İŞLEMİ ---
const saveAnnouncementBtn = document.getElementById('save-announcement-btn');
if (saveAnnouncementBtn) {
    saveAnnouncementBtn.addEventListener('click', async (e) => {
        e.preventDefault();
        const textEl = document.getElementById('announcement-text');
        const activeEl = document.getElementById('announcement-active');
        const winterEl = document.getElementById('announcement-winter-mode');

        const text = textEl ? textEl.value.trim() : "";
        const isActive = activeEl ? activeEl.checked : false;
        const isWinterMode = winterEl ? winterEl.checked : false;

        saveAnnouncementBtn.disabled = true;
        saveAnnouncementBtn.textContent = "Kyd...";

        try {
            await setDoc(doc(db, "site_settings", "announcement"), { text: text, isActive: isActive, isWinterMode: isWinterMode }, { merge: true });
            showToast("Duyuru yayına alındı!", "success");
        } catch (err) {
            showToast("Duyuru kaydedilemedi.", "error");
            console.error(err);
        } finally {
            saveAnnouncementBtn.disabled = false;
            saveAnnouncementBtn.textContent = "Kaydet";
        }
    });
}

const adminCityContainer = document.getElementById('admin-city-dropdown-container');
const adminCityBtn = document.getElementById('admin-city-dropdown-btn');
const adminCityText = document.getElementById('admin-city-dropdown-text');
const adminCityMenu = document.getElementById('admin-city-dropdown-menu');
const adminCitySearch = document.getElementById('admin-city-dropdown-search');
const adminCityList = document.getElementById('admin-city-dropdown-list');
const hCityInput = document.getElementById('h-city');

const adminCityOptions = [{ value: 'genel', label: '🌍 Tüm Türkiye (Genel)' }, ...citiesList.map(c => ({ value: c, label: c }))];

function setAdminCityDropdownValue(val) {
    if (!hCityInput) return;
    const opt = adminCityOptions.find(o => o.value === val) || adminCityOptions[0];
    hCityInput.value = opt.value;
    if (adminCityText) adminCityText.textContent = opt.label;
}

if (adminCityContainer) {
    const renderAdminDropdownOptions = (searchTerm = "") => {
        adminCityList.innerHTML = "";
        const filtered = adminCityOptions.filter(opt => opt.label.toLowerCase().includes(searchTerm.toLowerCase()));
        
        if (filtered.length === 0) {
            adminCityList.innerHTML = `<li class="px-4 py-2.5 text-slate-500 text-center">Sonuç bulunamadı</li>`;
            return;
        }

            const fragment = document.createDocumentFragment();
        filtered.forEach(opt => {
            const li = document.createElement('li');
            const isSelected = hCityInput.value === opt.value;
            li.className = `px-4 py-2.5 cursor-pointer hover:bg-slate-600/50 text-slate-300 transition-colors ${isSelected ? 'bg-slate-600 text-white font-bold' : ''}`;
            li.textContent = opt.label;
                li.dataset.value = opt.value;
                fragment.appendChild(li);
        });
            adminCityList.appendChild(fragment);
    };

    const closeAdminDropdown = () => {
        adminCityMenu.classList.add('opacity-0', '-translate-y-2');
        setTimeout(() => {
            adminCityMenu.classList.add('hidden');
            adminCityMenu.classList.remove('flex');
        }, 150);
    };

    const openAdminDropdown = () => {
        adminCitySearch.value = "";
        renderAdminDropdownOptions();
        adminCityMenu.classList.remove('hidden');
        adminCityMenu.classList.add('flex');
        requestAnimationFrame(() => {
            adminCityMenu.classList.remove('opacity-0', '-translate-y-2');
            adminCitySearch.focus();
        });
    };

    adminCityBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (adminCityMenu.classList.contains('hidden')) openAdminDropdown();
        else closeAdminDropdown();
    });

    // Event Delegation (Her li elemanı yerine parent üzerinden dinleme)
    adminCityList.addEventListener('click', (e) => {
        const li = e.target.closest('li[data-value]');
        if (!li) return;
        setAdminCityDropdownValue(li.dataset.value);
        closeAdminDropdown();
    });

    let adminSearchTimeout;
    adminCitySearch.addEventListener('input', (e) => {
        const val = e.target.value; // Değeri senkron olarak güvenceye alıyoruz
        clearTimeout(adminSearchTimeout);
        adminSearchTimeout = setTimeout(() => {
            renderAdminDropdownOptions(val);
        }, 150);
    });

    document.addEventListener('click', (e) => {
        if (!adminCityContainer.contains(e.target)) closeAdminDropdown();
    });
}

// --- TAKVİM VE FORM SENKRONİZASYON OLAYLARI ---
const adminPrevMonthBtn = document.getElementById('admin-prev-month');
const adminNextMonthBtn = document.getElementById('admin-next-month');
const hStartInput = document.getElementById("h-start");
const hEndInput = document.getElementById("h-end");

const adminTodayBtn = document.getElementById('admin-today-btn');
if (adminTodayBtn) adminTodayBtn.addEventListener('click', () => {
    const now = new Date();
    currentAdminMonth = now.getMonth();
    currentAdminYear = now.getFullYear();
    renderAdminCalendar();
});

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
    if (hEndInput) hEndInput.min = selectedStartDate; // Bitiş tarihi başlangıçtan önce seçilemesin
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
const tabHome = document.getElementById("tab-home");
const tabHolidays = document.getElementById("tab-holidays");
const tabStats = document.getElementById("tab-stats");
const tabWeather = document.getElementById("tab-weather");
const tabNotifications = document.getElementById("tab-notifications");
const sectionHome = document.getElementById("section-home");
const sectionHolidays = document.getElementById("section-holidays");
const sectionStats = document.getElementById("section-stats");
const sectionWeather = document.getElementById("section-weather");
const sectionNotifications = document.getElementById("section-notifications");

function switchAdminTab(activeTab, activeSection) {
    const tabs = [tabHome, tabHolidays, tabStats, tabWeather, tabNotifications];
    const sections = [sectionHome, sectionHolidays, sectionStats, sectionWeather, sectionNotifications];
    
    tabs.forEach(t => {
        if (t) t.className = "pb-3 text-sm font-semibold text-slate-400 hover:text-slate-200 border-b-2 border-transparent hover:border-slate-600 focus:outline-none transition-all whitespace-nowrap";
    });
    sections.forEach(s => {
        if (s) s.classList.add("hidden");
    });
    
    if (activeTab) activeTab.className = "pb-3 text-sm font-semibold text-slate-100 border-b-2 border-slate-100 focus:outline-none transition-all whitespace-nowrap";
    if (activeSection) activeSection.classList.remove("hidden");
}

if (tabHome) tabHome.addEventListener("click", () => switchAdminTab(tabHome, sectionHome));
if (tabHolidays) tabHolidays.addEventListener("click", () => switchAdminTab(tabHolidays, sectionHolidays));
if (tabStats) tabStats.addEventListener("click", () => switchAdminTab(tabStats, sectionStats));

// Ana sayfadaki Hızlı Kısayol (Quick Links) butonlarının olayları
document.querySelectorAll('.quick-link-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
        const targetId = e.currentTarget.getAttribute('data-target');
        const targetBtn = document.getElementById(targetId);
        if (targetBtn) targetBtn.click();
    });
});

if (tabWeather) tabWeather.addEventListener("click", () => {
    switchAdminTab(tabWeather, sectionWeather);
    if (typeof loadAdminWeather === "function" && !window.adminWeatherLoaded) {
        loadAdminWeather();
    }
});
if (tabNotifications) tabNotifications.addEventListener("click", () => switchAdminTab(tabNotifications, sectionNotifications));

// --- METEOROLOJİ (HAVA DURUMU) İZLEME PANELİ ---
window.adminWeatherLoaded = false;
const adminCityCoords = [
    { name: "Adana", lat: 37.00, lon: 35.32 }, { name: "Adıyaman", lat: 37.76, lon: 38.27 },
    { name: "Afyonkarahisar", lat: 38.75, lon: 30.53 }, { name: "Ağrı", lat: 39.71, lon: 43.05 },
    { name: "Amasya", lat: 40.64, lon: 35.83 }, { name: "Ankara", lat: 39.93, lon: 32.86 },
    { name: "Antalya", lat: 36.90, lon: 30.71 }, { name: "Artvin", lat: 41.18, lon: 41.82 },
    { name: "Aydın", lat: 37.84, lon: 27.85 }, { name: "Balıkesir", lat: 39.65, lon: 27.88 },
    { name: "Bilecik", lat: 40.15, lon: 29.98 }, { name: "Bingöl", lat: 38.88, lon: 40.49 },
    { name: "Bitlis", lat: 38.40, lon: 42.11 }, { name: "Bolu", lat: 40.74, lon: 31.61 },
    { name: "Burdur", lat: 37.72, lon: 30.28 }, { name: "Bursa", lat: 40.18, lon: 29.07 },
    { name: "Çanakkale", lat: 40.16, lon: 26.41 }, { name: "Çankırı", lat: 40.60, lon: 33.61 },
    { name: "Çorum", lat: 40.55, lon: 34.96 }, { name: "Denizli", lat: 37.78, lon: 29.09 },
    { name: "Diyarbakır", lat: 37.91, lon: 40.23 }, { name: "Edirne", lat: 41.68, lon: 26.56 },
    { name: "Elazığ", lat: 38.68, lon: 39.23 }, { name: "Erzincan", lat: 39.75, lon: 39.50 },
    { name: "Erzurum", lat: 39.90, lon: 41.27 }, { name: "Eskişehir", lat: 39.78, lon: 30.52 },
    { name: "Gaziantep", lat: 37.07, lon: 37.38 }, { name: "Giresun", lat: 40.91, lon: 38.39 },
    { name: "Gümüşhane", lat: 40.46, lon: 39.48 }, { name: "Hakkâri", lat: 37.57, lon: 43.74 },
    { name: "Hatay", lat: 36.40, lon: 36.35 }, { name: "Isparta", lat: 37.76, lon: 30.56 },
    { name: "Mersin", lat: 36.81, lon: 34.64 }, { name: "İstanbul", lat: 41.01, lon: 28.98 },
    { name: "İzmir", lat: 38.42, lon: 27.14 }, { name: "Kars", lat: 40.60, lon: 43.09 },
    { name: "Kastamonu", lat: 41.38, lon: 33.78 }, { name: "Kayseri", lat: 38.72, lon: 35.48 },
    { name: "Kırklareli", lat: 41.74, lon: 27.23 }, { name: "Kırşehir", lat: 39.15, lon: 34.16 },
    { name: "Kocaeli", lat: 40.85, lon: 29.88 }, { name: "Konya", lat: 37.87, lon: 32.49 },
    { name: "Kütahya", lat: 39.42, lon: 29.99 }, { name: "Malatya", lat: 38.36, lon: 38.31 },
    { name: "Manisa", lat: 38.62, lon: 27.43 }, { name: "K.maraş", lat: 37.58, lon: 36.92 },
    { name: "Mardin", lat: 37.31, lon: 40.74 }, { name: "Muğla", lat: 37.22, lon: 28.36 },
    { name: "Muş", lat: 38.74, lon: 41.49 }, { name: "Nevşehir", lat: 38.62, lon: 34.71 },
    { name: "Niğde", lat: 37.97, lon: 34.68 }, { name: "Ordu", lat: 40.99, lon: 37.88 },
    { name: "Rize", lat: 41.02, lon: 40.52 }, { name: "Sakarya", lat: 40.77, lon: 30.39 },
    { name: "Samsun", lat: 41.29, lon: 36.33 }, { name: "Siirt", lat: 37.93, lon: 41.95 },
    { name: "Sinop", lat: 42.02, lon: 35.15 }, { name: "Sivas", lat: 39.75, lon: 37.02 },
    { name: "Tekirdağ", lat: 40.98, lon: 27.51 }, { name: "Tokat", lat: 40.32, lon: 36.55 },
    { name: "Trabzon", lat: 41.00, lon: 39.72 }, { name: "Tunceli", lat: 39.11, lon: 39.55 },
    { name: "Şanlıurfa", lat: 37.16, lon: 38.80 }, { name: "Uşak", lat: 38.67, lon: 29.41 },
    { name: "Van", lat: 38.50, lon: 43.37 }, { name: "Yozgat", lat: 39.82, lon: 34.80 },
    { name: "Zonguldak", lat: 41.46, lon: 31.80 }, { name: "Aksaray", lat: 38.37, lon: 34.04 },
    { name: "Bayburt", lat: 40.26, lon: 40.23 }, { name: "Karaman", lat: 37.18, lon: 33.22 },
    { name: "Kırıkkale", lat: 39.84, lon: 33.51 }, { name: "Batman", lat: 37.88, lon: 41.14 },
    { name: "Şırnak", lat: 37.52, lon: 42.45 }, { name: "Bartın", lat: 41.64, lon: 32.34 },
    { name: "Ardahan", lat: 41.11, lon: 42.70 }, { name: "Iğdır", lat: 39.92, lon: 44.05 },
    { name: "Yalova", lat: 40.65, lon: 29.27 }, { name: "Karabük", lat: 41.20, lon: 32.62 },
    { name: "Kilis", lat: 36.72, lon: 37.11 }, { name: "Osmaniye", lat: 37.07, lon: 36.25 },
    { name: "Düzce", lat: 40.84, lon: 31.16 }
];

let weatherDataCache = [];
let currentWeatherFilter = 'all';
let currentWeatherSearch = '';

function getAdminWeatherInfo(code) {
    if (code === 0) return { text: 'Güneşli', emoji: '☀️', isBad: false };
    if ([1, 2].includes(code)) return { text: 'Bulutlu', emoji: '⛅', isBad: false };
    if (code === 3) return { text: 'Ç. Bulutlu', emoji: '☁️', isBad: false };
    if ([45, 48].includes(code)) return { text: 'Sisli', emoji: '🌫️', isBad: false };
    if ([51, 53, 55, 56, 57].includes(code)) return { text: 'Çisenti', emoji: '🌦️', isBad: false };
    if ([61, 63, 65, 80, 81, 82].includes(code)) return { text: 'Yağmurlu', emoji: '🌧️', isBad: false };
    if ([71, 73, 75, 77, 85, 86].includes(code)) return { text: 'Kar', emoji: '❄️', isBad: true };
    if ([95, 96, 99].includes(code)) return { text: 'Fırtına', emoji: '⛈️', isBad: true };
    return { text: 'Bilinmiyor', emoji: '🌍', isBad: false };
}

async function loadAdminWeather() {
    window.adminWeatherLoaded = true;
    const grid = document.getElementById("weather-grid");
    const btn = document.getElementById("refresh-weather-btn");
    if (!grid) return;

    if (btn) {
        btn.innerHTML = `<svg class="animate-spin w-4 h-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg> Yenileniyor...`;
        btn.disabled = true;
    }

    grid.innerHTML = `<div class="col-span-full text-center py-10 text-slate-400 flex flex-col items-center"><svg class="animate-spin h-8 w-8 text-slate-500 mb-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg><p>Türkiye geneli hava durumu verileri yükleniyor...</p></div>`;

    const lats = adminCityCoords.map(c => c.lat).join(',');
    const lons = adminCityCoords.map(c => c.lon).join(',');
    
    try {
        const res = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lats}&longitude=${lons}&current=temperature_2m,weather_code`);
        if (!res.ok) {
            throw new Error(`API Hatası (Sunucu çok yoğun olabilir): ${res.status}`);
        }
        const data = await res.json();

        grid.innerHTML = "";
        
        // Open-Meteo, çoklu lokasyon isteklerinde yanıtı bir DİZİ (array) olarak döndürür.
        const results = Array.isArray(data) ? data : [data];

        weatherDataCache = adminCityCoords.map((city, index) => {
            const currentData = (results[index] && results[index].current) ? results[index].current : {};
            const temp = currentData.temperature_2m !== undefined ? Math.round(currentData.temperature_2m) : null;
            const code = currentData.weather_code !== undefined ? currentData.weather_code : -1;
            const info = getAdminWeatherInfo(code);
            return { ...city, temp, code, info };
        });

        renderAdminWeather();
    } catch (error) {
        console.error("Hava durumu çekilemedi:", error);
        grid.innerHTML = `<div class="col-span-full text-center text-rose-400 py-6 font-medium">Veriler alınırken bir hata oluştu. Lütfen tekrar deneyin.</div>`;
    } finally {
        if (btn) {
            btn.innerHTML = `<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path></svg> Yenile`;
            btn.disabled = false;
        }
    }
}

function renderAdminWeather() {
    const grid = document.getElementById("weather-grid");
    if (!grid) return;

    const filtered = weatherDataCache.filter(item => {
        const matchSearch = item.name.toLowerCase().includes(currentWeatherSearch.toLowerCase());
        const matchFilter = currentWeatherFilter === 'all' || (currentWeatherFilter === 'alert' && item.info.isBad);
        return matchSearch && matchFilter;
    });

    const alertCount = weatherDataCache.filter(item => item.info.isBad).length;
    const countEl = document.getElementById("weather-alert-count");
    if (countEl) countEl.textContent = alertCount;

    if (filtered.length === 0) {
        grid.innerHTML = `<div class="col-span-full text-center text-slate-400 py-10 font-medium bg-slate-800/50 rounded-xl border border-slate-700/50">Arama kriterlerine uygun şehir bulunamadı.</div>`;
        return;
    }

    grid.innerHTML = "";
    filtered.forEach((item, displayIndex) => {
        const tempText = item.temp !== null ? `${item.temp}°C` : '--°C';
        const alertClass = item.info.isBad ? 'bg-rose-500/10 border-rose-500/30 ring-1 ring-rose-500/50' : 'bg-slate-800 border-slate-700/50 hover:bg-slate-700/80';
        const tempColor = item.info.isBad ? 'text-rose-400' : 'text-slate-100';
        const delay = Math.min(displayIndex * 15, 300); // Max 300ms gecikme

        const card = `
            <div class="relative ${alertClass} border p-3 rounded-xl flex flex-col items-center justify-center text-center transition-all duration-300 hover:-translate-y-1 hover:shadow-md animate-fadeIn" style="animation-delay: ${delay}ms;">
                <span class="text-xs font-bold text-slate-300 mb-1 truncate w-full" title="${item.name}">${item.name}</span>
                <div class="text-3xl my-1 drop-shadow-sm">${item.info.emoji}</div>
                <span class="text-lg font-black ${tempColor}">${tempText}</span>
                <span class="text-[10px] text-slate-400 mt-1 uppercase tracking-wider font-semibold">${item.info.text}</span>
                ${item.info.isBad ? '<span class="absolute top-2 right-2 w-2 h-2 bg-rose-500 rounded-full animate-pulse shadow-[0_0_8px_rgba(244,63,94,0.8)]" title="Olumsuz Hava Uyarısı"></span>' : ''}
            </div>
        `;
        grid.innerHTML += card;
    });
}

// --- HAVA DURUMU FİLTRELEME VE ARAMA OLAYLARI ---
const weatherSearchInput = document.getElementById('weather-search');
const weatherFilterAll = document.getElementById('weather-filter-all');
const weatherFilterAlert = document.getElementById('weather-filter-alert');

if (weatherSearchInput) {
    weatherSearchInput.addEventListener('input', (e) => {
        currentWeatherSearch = e.target.value;
        renderAdminWeather();
    });
}

if (weatherFilterAll && weatherFilterAlert) {
    weatherFilterAll.addEventListener('click', () => {
        currentWeatherFilter = 'all';
        weatherFilterAll.className = "px-4 py-2 text-xs font-bold bg-indigo-600 text-white rounded-lg transition-colors shrink-0 shadow-sm";
        weatherFilterAlert.className = "px-4 py-2 text-xs font-bold bg-slate-700 hover:bg-rose-600 text-slate-300 hover:text-white rounded-lg transition-colors shrink-0 flex items-center gap-1.5";
        renderAdminWeather();
    });

    weatherFilterAlert.addEventListener('click', () => {
        currentWeatherFilter = 'alert';
        weatherFilterAlert.className = "px-4 py-2 text-xs font-bold bg-rose-600 text-white rounded-lg transition-colors shrink-0 flex items-center gap-1.5 shadow-sm ring-1 ring-rose-500";
        weatherFilterAll.className = "px-4 py-2 text-xs font-bold bg-slate-700 hover:bg-indigo-500 text-slate-300 hover:text-white rounded-lg transition-colors shrink-0";
        renderAdminWeather();
    });
}

const refreshWeatherBtn = document.getElementById("refresh-weather-btn");
if (refreshWeatherBtn) refreshWeatherBtn.addEventListener("click", loadAdminWeather);

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

// ESC tuşu ile açık olan modal/dropdown pencerelerini kapatma (Kullanılabilirlik artışı)
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        if (deleteModal && !deleteModal.classList.contains('hidden')) closeDeleteModal();
        if (deleteNotificationModal && !deleteNotificationModal.classList.contains('hidden')) closeDeleteNotificationModal();
        if (pushModal && !pushModal.classList.contains('hidden')) closePushModal();
        if (editProfileModal && !editProfileModal.classList.contains('hidden')) closeEditProfileModal();
        if (adminCityMenu && !adminCityMenu.classList.contains('hidden')) closeAdminDropdown();
    }
});

// Kopyalama, Kesme, Yapıştırma ve Sürükleme Engelleme (Sadece manuel yazmaya izin ver)
document.addEventListener('copy', (e) => e.preventDefault());
document.addEventListener('cut', (e) => e.preventDefault());
document.addEventListener('paste', (e) => e.preventDefault());
document.addEventListener('dragstart', (e) => e.preventDefault());
document.addEventListener('drop', (e) => e.preventDefault());

// --- PWA (Service Worker) KAYDI VE GÜNCELLEME KONTROLÜ ---
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        const swConfigParams = new URLSearchParams(firebaseConfig).toString();
        navigator.serviceWorker.register(`/sw.js?${swConfigParams}`);
    });
}

// --- PROFİL DÜZENLEME (KULLANICI ADI DEĞİŞTİRME) SİSTEMİ ---
const editProfileBtn = document.getElementById('edit-profile-btn');
const editProfileModal = document.getElementById('edit-profile-modal');
const editProfileBackdrop = document.getElementById('edit-profile-modal-backdrop');
const editProfileContent = document.getElementById('edit-profile-modal-content');
const cancelEditProfileBtn = document.getElementById('cancel-edit-profile-btn');
const confirmEditProfileBtn = document.getElementById('confirm-edit-profile-btn');
const newDisplayNameInput = document.getElementById('new-display-name');
const confirmEditProfileText = document.getElementById('confirm-edit-profile-text');
const confirmEditProfileSpinner = document.getElementById('confirm-edit-profile-spinner');

function openEditProfileModal() {
    if (auth.currentUser) {
        newDisplayNameInput.value = auth.currentUser.displayName || auth.currentUser.email.split('@')[0];
    }
    editProfileModal.classList.remove("hidden");
    editProfileModal.classList.add("flex");
    setTimeout(() => {
        editProfileBackdrop.classList.remove("opacity-0");
        editProfileContent.classList.remove("scale-95", "opacity-0");
    }, 10);
}

function closeEditProfileModal() {
    editProfileBackdrop.classList.add("opacity-0");
    editProfileContent.classList.add("scale-95", "opacity-0");
    setTimeout(() => {
        editProfileModal.classList.add("hidden");
        editProfileModal.classList.remove("flex");
        confirmEditProfileBtn.disabled = false;
        confirmEditProfileText.textContent = "Kaydet";
        confirmEditProfileSpinner.classList.add("hidden");
        confirmEditProfileBtn.classList.remove("cursor-not-allowed", "opacity-75");
    }, 300);
}

if (editProfileBtn) editProfileBtn.addEventListener('click', openEditProfileModal);
if (cancelEditProfileBtn) cancelEditProfileBtn.addEventListener('click', closeEditProfileModal);

if (confirmEditProfileBtn) {
    confirmEditProfileBtn.addEventListener('click', async () => {
        const newName = newDisplayNameInput.value.trim();
        if (!newName) {
            showToast("Lütfen geçerli bir kullanıcı adı girin.", "warning");
            return;
        }

        confirmEditProfileBtn.disabled = true;
        confirmEditProfileBtn.classList.add("cursor-not-allowed", "opacity-75");
        confirmEditProfileText.textContent = "Kaydediliyor...";
        confirmEditProfileSpinner.classList.remove("hidden");

        try {
            await updateProfile(auth.currentUser, { displayName: newName });
            showToast("Kullanıcı adınız başarıyla güncellendi!", "success");
            
            const welcomeNameEl = document.getElementById('admin-welcome-name');
            if (welcomeNameEl) {
                welcomeNameEl.textContent = newName.charAt(0).toUpperCase() + newName.slice(1);
            }
            closeEditProfileModal();
        } catch (error) {
            showToast("Kullanıcı adı güncellenirken bir hata oluştu.", "error");
            console.error("Profile update error:", error);
            confirmEditProfileBtn.disabled = false;
            confirmEditProfileBtn.classList.remove("cursor-not-allowed", "opacity-75");
            confirmEditProfileText.textContent = "Kaydet";
            confirmEditProfileSpinner.classList.add("hidden");
        }
    });
}
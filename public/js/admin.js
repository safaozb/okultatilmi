import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, onAuthStateChanged, signOut, setPersistence, browserSessionPersistence } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getFirestore, collection, addDoc, deleteDoc, doc, onSnapshot } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { firebaseConfig } from "./config.js";

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

// Şifre Göster/Gizle Mantığı
const togglePasswordBtn = document.getElementById("toggle-password");
const passwordInput = document.getElementById("password");
const eyeIcon = document.getElementById("eye-icon");
const eyeSlashIcon = document.getElementById("eye-slash-icon");
if (togglePasswordBtn && passwordInput) {
    togglePasswordBtn.addEventListener("click", (e) => {
        e.preventDefault(); // Butonun tıklama esnasında sayfa odağını bozmasını engeller
        if (passwordInput.type === "password") {
            passwordInput.type = "text";
            eyeIcon.classList.add("hidden");
            eyeSlashIcon.classList.remove("hidden");
        } else {
            passwordInput.type = "password";
            eyeIcon.classList.remove("hidden");
            eyeSlashIcon.classList.add("hidden");
        }
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
            alert("Uzun süre işlem yapmadığınız için güvenliğiniz gereği oturumunuz sonlandırıldı.");
            signOut(auth);
        }, INACTIVITY_LIMIT);
    }
}

// Kullanıcı fareyi oynattığında veya tuşa bastığında süreyi sıfırla
window.addEventListener('mousemove', resetInactivityTimer);
window.addEventListener('keypress', resetInactivityTimer);
window.addEventListener('click', resetInactivityTimer);

// Oturum Durumunu Dinleme
onAuthStateChanged(auth, (user) => {
    if (user) {
        loginSection.classList.add("hidden");
        adminSection.classList.remove("hidden");
        // If not already listening, start listening for holidays
        // This listener will automatically update the list when holidays are added/deleted.
        if (!holidaysCollectionUnsubscribe) {
            holidaysCollectionUnsubscribe = onSnapshot(collection(db, "custom_holidays"), (snapshot) => {
                const holidays = [];
                snapshot.forEach((doc) => {
                        holidays.push({ id: doc.id, ...doc.data() });
                    });
                    renderHolidays(holidays);
                });
            }
        resetInactivityTimer(); // Giriş yapıldığında süreyi başlat
    } else {
        loginSection.classList.remove("hidden");
        adminSection.classList.add("hidden");
            // Çıkış yapıldığında veritabanı dinlemesini durdur
            if (holidaysCollectionUnsubscribe) {
                holidaysCollectionUnsubscribe();
                holidaysCollectionUnsubscribe = null;
            }
        clearTimeout(inactivityTimer); // Çıkış yapıldığında sayacı durdur
    }
});

function renderHolidays(holidays) {
    currentHolidaysList.innerHTML = "";
    if (holidays.length === 0) {
        noHolidaysMsg.classList.remove("hidden");
        return;
    }
    
    noHolidaysMsg.classList.add("hidden");
    
    holidays.forEach((holiday) => {
        const div = document.createElement("div");
        div.className = "flex justify-between items-center bg-slate-50 border border-slate-200 p-3 rounded-lg";
        div.innerHTML = `
            <div>
                <h4 class="font-semibold text-slate-800 text-sm">${holiday.name}</h4>
                <p class="text-xs text-slate-500">${holiday.start} - ${holiday.end}</p>
            </div>
            <button data-id="${holiday.id}" class="delete-btn px-3 py-1.5 text-xs font-semibold text-white bg-red-500 hover:bg-red-600 rounded-md transition-colors shadow-sm">Sil</button>
        `;
        currentHolidaysList.appendChild(div);
    });

    // Silme Butonlarına Olay Ekleyelim
    document.querySelectorAll(".delete-btn").forEach((btn) => {
        btn.addEventListener("click", async (e) => {
            if (confirm("Bu tatili silmek istediğinize emin misiniz?")) {
                const id = e.target.getAttribute("data-id");
                try {
                    e.target.disabled = true;
                    e.target.textContent = "Siliniyor...";
                    await deleteDoc(doc(db, "custom_holidays", id));
                } catch (error) {
                    alert("Tatil silinirken bir hata oluştu.");
                    console.error(error);
                    e.target.disabled = false;
                    e.target.textContent = "Sil";
                }
            }
        });
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
    btn.disabled = true;
    btn.textContent = "Kaydediliyor...";

    const newHoliday = {
        name: document.getElementById("h-name").value,
        start: document.getElementById("h-start").value,
        end: document.getElementById("h-end").value,
        duration: document.getElementById("h-duration").value,
        type: document.getElementById("h-type").value
    };

    try {
        await addDoc(collection(db, "custom_holidays"), newHoliday);
        const successMsg = document.getElementById("add-success");
        successMsg.classList.remove("hidden");
        addHolidayForm.reset();
        
        setTimeout(() => successMsg.classList.add("hidden"), 4000);
    } catch (error) {
        alert("Veri eklenirken hata oluştu: Firebase kurallarını veya bağlantınızı kontrol edin.");
        console.error(error);
    } finally {
        btn.disabled = false;
        btn.textContent = "Tatili Yayınla";
    }
});
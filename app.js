import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getDatabase, ref, set, onValue, push, child } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

// --- KONFIGURASI FIREBASE ---
const firebaseConfig = { 
   apiKey: "AIzaSyBKdviLrRb1JuqwRb3nj4dZO3NNF4FMkhM", 
   authDomain: "sounboard-89afd.firebaseapp.com", 
   projectId: "sounboard-89afd", 
   databaseURL: "https://sounboard-89afd-default-rtdb.asia-southeast1.firebasedatabase.app", // URL sesuai gambar (Singapura)
   storageBucket: "sounboard-89afd.firebasestorage.app", 
   messagingSenderId: "94843476027", 
   appId: "1:94843476027:web:df6b1c9886ee910f29e41e", 
   measurementId: "G-5WCVFSG67B" 
}; 

// Proteksi jika dibuka tanpa server (file://)
if (window.location.protocol === 'file:') {
    alert("PERINGATAN: Aplikasi ini menggunakan Firebase Modules dan tidak dapat berjalan jika dibuka langsung (double-click file .html). Silakan gunakan Live Server di VS Code atau upload ke hosting (seperti Firebase Hosting/Netlify).");
}

// Global Error Handler untuk Debugging
window.onerror = function(message, source, lineno, colno, error) {
    console.error("Global Error:", message, "at", source, ":", lineno);
    const errDiv = document.getElementById('auth-error');
    if (errDiv) {
        errDiv.textContent = "Script Error: " + message;
        errDiv.classList.remove('d-none');
    }
    return false;
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getDatabase(app);

// Tambahkan listener untuk koneksi database (debugging)
const connectedRef = ref(db, ".info/connected");
onValue(connectedRef, (snap) => {
  if (snap.val() === true) {
    console.log("Database: Terhubung");
  } else {
    console.log("Database: Terputus");
  }
});

// DOM Elements
const authSection = document.getElementById('auth-section');
const mainContent = document.getElementById('main-content');
const loginForm = document.getElementById('login-form');
const btnLogin = document.getElementById('btn-login');
const btnRegister = document.getElementById('btn-register');
const authError = document.getElementById('auth-error');
const addSoundForm = document.getElementById('add-sound-form');
const editSoundForm = document.getElementById('edit-sound-form');
const btnDeleteSound = document.getElementById('btn-delete-sound');
const btnToggleEdit = document.getElementById('btn-toggle-edit');
const btnToggleMic = document.getElementById('btn-toggle-mic');
const micStatusAlert = document.getElementById('mic-status');
const soundboardGrid = document.getElementById('soundboard-grid');
const loadingSpinner = document.getElementById('loading-spinner');
const userDisplay = document.getElementById('user-display');
const btnLogout = document.getElementById('btn-logout');

let currentUser = null;
let lastPlayedTimestamp = 0;
let isEditMode = false;
let isMicMixing = false;
let audioCtx = null;
let micStream = null;
let mixerNode = null;
let ytPlayer = null;
let ytApiReady = false;

// --- YOUTUBE API SETUP ---
// Load YouTube IFrame Player API
const tag = document.createElement('script');
tag.src = "https://www.youtube.com/iframe_api";
const firstScriptTag = document.getElementsByTagName('script')[0];
firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);

window.onYouTubeIframeAPIReady = function() {
    ytPlayer = new YT.Player('yt-player', {
        height: '0',
        width: '0',
        videoId: '',
        playerVars: {
            'playsinline': 1,
            'autoplay': 0,
            'controls': 0
        },
        events: {
            'onReady': () => { ytApiReady = true; }
        }
    });
};

function getYouTubeID(url) {
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
    const match = url.match(regExp);
    return (match && match[2].length === 11) ? match[2] : null;
}

// --- AUTHENTICATION ---

// Auth State Listener
onAuthStateChanged(auth, (user) => {
    console.log("Status Auth Berubah:", user ? "Login sebagai " + user.email : "Belum Login");
    if (user) {
        currentUser = user;
        authSection.style.setProperty('display', 'none', 'important');
        mainContent.classList.remove('d-none');
        mainContent.style.display = 'block';
        
        userDisplay.textContent = user.email;
        loadSounds();
        setupPlaybackListener();
    } else {
        currentUser = null;
        authSection.style.setProperty('display', 'block', 'important');
        mainContent.classList.add('d-none');
        mainContent.style.display = 'none';
    }
});

// Login
loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    
    if (!email || !password) return;

    btnLogin.disabled = true;
    btnLogin.textContent = "Sedang Login...";
    authError.classList.add('d-none');

    try {
        await signInWithEmailAndPassword(auth, email, password);
    } catch (error) {
        console.error("Login Error:", error);
        authError.textContent = "Gagal Login: " + getFriendlyErrorMessage(error.code);
        authError.classList.remove('d-none');
    } finally {
        btnLogin.disabled = false;
        btnLogin.textContent = "Login";
    }
});

// Register
btnRegister.addEventListener('click', async () => {
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    
    if (!email || !password) {
        authError.textContent = "Email dan password harus diisi untuk mendaftar.";
        authError.classList.remove('d-none');
        return;
    }

    btnRegister.disabled = true;
    btnRegister.textContent = "Mendaftar...";
    authError.classList.add('d-none');

    try {
        await createUserWithEmailAndPassword(auth, email, password);
        alert("Pendaftaran berhasil! Anda otomatis masuk.");
    } catch (error) {
        console.error("Register Error:", error);
        authError.textContent = "Gagal Daftar: " + getFriendlyErrorMessage(error.code);
        authError.classList.remove('d-none');
    } finally {
        btnRegister.disabled = false;
        btnRegister.textContent = "Daftar Akun Baru";
    }
});

// Helper for readable errors
function getFriendlyErrorMessage(errorCode) {
    switch (errorCode) {
        case 'auth/invalid-credential':
            return 'Email atau password salah.';
        case 'auth/user-not-found':
            return 'Akun tidak ditemukan.';
        case 'auth/wrong-password':
            return 'Password salah.';
        case 'auth/email-already-in-use':
            return 'Email sudah terdaftar.';
        case 'auth/weak-password':
            return 'Password terlalu lemah (min. 6 karakter).';
        case 'auth/invalid-email':
            return 'Format email tidak valid.';
        case 'auth/operation-not-allowed':
            return 'Metode Login Email/Password belum diaktifkan di Firebase Console.';
        default:
            return 'Terjadi kesalahan sistem: ' + errorCode;
    }
}

// Logout
btnLogout.addEventListener('click', () => signOut(auth));

// Toggle Edit Mode
btnToggleEdit.addEventListener('click', () => {
    isEditMode = !isEditMode;
    if (isEditMode) {
        soundboardGrid.classList.add('edit-mode-active');
        btnToggleEdit.textContent = "✅ Selesai Edit";
        btnToggleEdit.classList.replace('btn-outline-primary', 'btn-primary');
    } else {
        soundboardGrid.classList.remove('edit-mode-active');
        btnToggleEdit.textContent = "✏️ Mode Edit";
        btnToggleEdit.classList.replace('btn-primary', 'btn-outline-primary');
    }
});

// Toggle Mic Mixing
btnToggleMic.addEventListener('click', async () => {
    if (!isMicMixing) {
        try {
            if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
            const micSource = audioCtx.createMediaStreamSource(micStream);
            
            mixerNode = audioCtx.createMediaStreamDestination();
            micSource.connect(audioCtx.destination); // Dengar diri sendiri
            
            isMicMixing = true;
            btnToggleMic.textContent = "🎤 Mix Mic: ON";
            btnToggleMic.classList.replace('btn-outline-secondary', 'btn-success');
            micStatusAlert.classList.remove('d-none');
            
            if (audioCtx.state === 'suspended') await audioCtx.resume();
        } catch (err) {
            alert("Gagal mengakses mic: " + err.message);
        }
    } else {
        if (micStream) micStream.getTracks().forEach(track => track.stop());
        isMicMixing = false;
        btnToggleMic.textContent = "🎤 Mix Mic: OFF";
        btnToggleMic.classList.replace('btn-success', 'btn-outline-secondary');
        micStatusAlert.classList.add('d-none');
    }
});

// --- SOUNDBOARD LOGIC ---

// Load sounds from Database
function loadSounds() {
    console.log("Memulai load sounds untuk user:", currentUser.uid);
    if (loadingSpinner) loadingSpinner.classList.remove('d-none');
    
    const soundsRef = ref(db, `users/${currentUser.uid}/sounds`);
    onValue(soundsRef, (snapshot) => {
        console.log("Snapshot database diterima");
        if (loadingSpinner) loadingSpinner.classList.add('d-none');
        
        // Clear previous sounds
        const currentButtons = soundboardGrid.querySelectorAll('.sound-item');
        currentButtons.forEach(btn => btn.remove());
        
        const data = snapshot.val();
        if (data) {
            console.log("Data ditemukan:", Object.keys(data).length, "items");
            Object.keys(data).forEach(key => {
                const sound = data[key];
                createSoundButton(key, sound);
            });
        } else {
            console.log("Tidak ada data soundboard.");
            soundboardGrid.innerHTML += '<p class="text-center text-muted mt-5 sound-item">Belum ada sound. Klik "Tambah Sound" untuk memulai!</p>';
        }
    }, (error) => {
        if (loadingSpinner) loadingSpinner.classList.add('d-none');
        console.error("Gagal mengambil data dari Firebase:", error);
        alert("Gagal memuat soundboard. Pastikan Security Rules di Firebase sudah benar.");
    });
}

// Create sound button UI
function createSoundButton(id, sound) {
    const col = document.createElement('div');
    col.className = 'col-6 col-md-3 col-lg-2 sound-item';
    col.innerHTML = `
        <div class="card h-100 text-center p-3 position-relative">
            <button class="btn btn-sm btn-light position-absolute top-0 end-0 m-1 edit-btn" onclick="openEditModal('${id}', '${sound.name}', '${sound.url}')" style="z-index: 10;">✏️</button>
            <div onclick="triggerPlayback('${sound.url}')" style="cursor: pointer;">
                <div class="display-6 mb-2">🔊</div>
                <div class="fw-bold text-truncate">${sound.name}</div>
            </div>
        </div>
    `;
    soundboardGrid.appendChild(col);
}

// --- EDIT & DELETE LOGIC ---

window.openEditModal = function(id, name, url) {
    document.getElementById('edit-sound-id').value = id;
    document.getElementById('edit-sound-name').value = name;
    document.getElementById('edit-sound-url').value = url;
    
    const modal = new bootstrap.Modal(document.getElementById('editSoundModal'));
    modal.show();
};

editSoundForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('edit-sound-id').value;
    const name = document.getElementById('edit-sound-name').value;
    const url = document.getElementById('edit-sound-url').value;

    const submitBtn = e.target.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Menyimpan...';

    try {
        const soundRef = ref(db, `users/${currentUser.uid}/sounds/${id}`);
        await set(soundRef, {
            name: name,
            url: url,
            updatedAt: Date.now()
        });

        const modal = bootstrap.Modal.getInstance(document.getElementById('editSoundModal'));
        modal.hide();
    } catch (error) {
        alert("Gagal mengupdate sound: " + error.message);
    } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Simpan Perubahan';
    }
});

btnDeleteSound.addEventListener('click', async () => {
    const id = document.getElementById('edit-sound-id').value;
    if (!confirm("Apakah Anda yakin ingin menghapus sound ini?")) return;

    btnDeleteSound.disabled = true;
    btnDeleteSound.textContent = 'Menghapus...';

    try {
        const soundRef = ref(db, `users/${currentUser.uid}/sounds/${id}`);
        await set(soundRef, null); // Set null to delete

        const modal = bootstrap.Modal.getInstance(document.getElementById('editSoundModal'));
        modal.hide();
    } catch (error) {
        alert("Gagal menghapus sound: " + error.message);
    } finally {
        btnDeleteSound.disabled = false;
        btnDeleteSound.textContent = 'Hapus Sound';
    }
});

// Trigger playback (Write to DB for sync)
window.triggerPlayback = function(url) {
    if (!currentUser) return;
    const playbackRef = ref(db, `users/${currentUser.uid}/playback`);
    set(playbackRef, {
        url: url,
        timestamp: Date.now(),
        triggeredBy: auth.currentUser.uid + '-' + Math.random().toString(36).substr(2, 9)
    });
};

// Listen for playback events (The magic sync part)
function setupPlaybackListener() {
    const playbackRef = ref(db, `users/${currentUser.uid}/playback`);
    onValue(playbackRef, (snapshot) => {
        const data = snapshot.val();
        if (data && data.timestamp > lastPlayedTimestamp) {
            lastPlayedTimestamp = data.timestamp;
            playSound(data.url);
        }
    });
}

// Actual sound playing
function playSound(url) {
    const ytId = getYouTubeID(url);
    
    if (ytId) {
        // Play via YouTube API
        if (ytApiReady && ytPlayer) {
            ytPlayer.loadVideoById(ytId);
            ytPlayer.playVideo();
        } else {
            console.error("YouTube API not ready yet");
        }
    } else {
        // Play via HTML5 Audio
        const audio = new Audio(url);
        
        // Jika Mic Mixing aktif, rute audio melalui AudioContext
        if (isMicMixing && audioCtx) {
            const source = audioCtx.createMediaElementSource(audio);
            source.connect(audioCtx.destination);
        }
        
        audio.play().catch(e => console.error("Playback failed:", e));
    }
}

// --- ADD SOUND ---

addSoundForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    console.log("Submit form tambah sound dipicu");

    const nameInput = document.getElementById('sound-name');
    const urlInput = document.getElementById('sound-url');
    
    const name = nameInput.value;
    const url = urlInput.value;

    if (!url || !currentUser) {
        console.error("URL kosong atau user tidak terautentikasi");
        return;
    }

    const submitBtn = e.target.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Menyimpan...';

    try {
        console.log("Mencoba menyimpan ke Firebase...");
        console.log("User UID:", currentUser.uid);
        console.log("Database URL yang digunakan:", firebaseConfig.databaseURL);
        
        // Timeout 10 detik agar tidak stuck selamanya
        const savePromise = (async () => {
            const soundsRef = ref(db, `users/${currentUser.uid}/sounds`);
            const newSoundRef = push(soundsRef);
            await set(newSoundRef, {
                name: name,
                url: url,
                createdAt: Date.now()
            });
        })();

        const timeoutPromise = new Promise((_, reject) => 
            setTimeout(() => reject(new Error("Waktu simpan habis (Timeout). Periksa koneksi atau databaseURL Anda.")), 10000)
        );

        await Promise.race([savePromise, timeoutPromise]);

        console.log("Data berhasil disimpan ke Firebase");

        // Reset form
        addSoundForm.reset();
        
        // Close modal (Bootstrap 5 way)
        const modalElement = document.getElementById('addSoundModal');
        const modalInstance = bootstrap.Modal.getInstance(modalElement) || new bootstrap.Modal(modalElement);
        modalInstance.hide();
        
        alert("Soundboard berhasil ditambahkan!");
    } catch (error) {
        console.error("Gagal menyimpan sound:", error);
        alert("Gagal menyimpan sound: " + error.message);
    } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Simpan';
    }
});

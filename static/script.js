// ==========================================
// 1. GLOBAL DEĞİŞKENLER VE ELEMENT SEÇİMİ
// ==========================================
let currentChatId = null; // Şu anki sohbetin ID'si
let pyodideReady = false; // Python motoru durumu
let pyodide;              // Python motoru değişkeni
let editor;               // Ace Editor değişkeni

// DOM Elementleri
const sidebar = document.getElementById('sidebar');
const menuBtn = document.getElementById('menu-btn');
const chatContainer = document.getElementById('chat-container');
const userInput = document.getElementById('user-input');
const sendBtn = document.getElementById('send-btn');
const welcomeMessage = document.querySelector('.welcome-message');
const navLinks = document.querySelector('.nav-links'); // Sohbet geçmişi buraya eklenecek
const newChatBtn = document.querySelector('.new-chat-btn');

// Editör Elementleri
const editorSection = document.getElementById('editor-section');
const openEditorBtn = document.querySelector('.nav-item:nth-child(2)'); // "Kod Deneme" butonu
const closeEditorBtn = document.getElementById('close-editor-btn');
const runCodeBtn = document.getElementById('run-code-btn');
const outputConsole = document.getElementById('code-output');

// Ayarlar Elementleri
const settingsBtn = document.querySelector('.bottom-section .nav-item:first-child');
const settingsModal = document.getElementById('settings-modal');
const closeSettingsBtn = document.getElementById('close-settings');


// ==========================================
// 2. BAŞLANGIÇ AYARLARI (INIT)
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
    // Sohbet geçmişini veritabanından çek
    loadChatHistory();
    
    // Ace Editor Kurulumu (Varsa)
    if (document.getElementById('ace-editor')) {
        editor = ace.edit("ace-editor");
        editor.setTheme("ace/theme/twilight");
        editor.session.setMode("ace/mode/python");
    }
});


// ==========================================
// 3. SOHBET GEÇMİŞİ VE SIDEBAR İŞLEMLERİ
// ==========================================

// Sidebar Aç/Kapa
menuBtn.addEventListener('click', () => {
    sidebar.classList.toggle('collapsed');
});

// Veritabanından Geçmişi Yükle
async function loadChatHistory() {
    try {
        const response = await fetch('/get_history');
        const chats = await response.json();
        
        // Önceki dinamik sohbetleri temizle (Statik butonları koru)
        // Not: nav-links içindeki 'static' class'ı olmayanları siliyoruz (eğer eklediysek)
        // Ya da basitçe: İlk 2 eleman haricindekileri sil.
        const staticItems = Array.from(navLinks.children).slice(0, 2); 
        navLinks.innerHTML = ''; 
        staticItems.forEach(item => navLinks.appendChild(item));

        // Veritabanından gelenleri ekle
        chats.forEach(chat => {
            addChatToSidebar(chat.title, chat.id);
        });

    } catch (error) {
        console.error("Geçmiş yüklenemedi:", error);
    }
}

// Sidebar'a Tek Bir Sohbet Ekleme
function addChatToSidebar(title, id) {
    const div = document.createElement('div');
    div.classList.add('nav-item');
    div.dataset.id = id; 
    
    div.innerHTML = `
        <span class="material-symbols-outlined">chat_bubble_outline</span>
        <span class="text">${title}</span>
    `;
    
    // Tıklayınca o sohbete geçiş yap (Görsel seçim)
    // *Geliştirme Notu: İleride buraya tıklayınca eski mesajları getirme kodu eklenecek.
    div.addEventListener('click', () => {
        currentChatId = id;
        document.querySelectorAll('.nav-item').forEach(item => item.classList.remove('active'));
        div.classList.add('active');
        // İpucu: Burada /get_chat_messages endpoint'i yazılıp çağrılabilir.
    });

    // Listeye ekle (Listenin 3. sırasına, butonlardan sonraya)
    // Ya da en üste ekleyip statik butonları korumak daha mantıklı:
    navLinks.insertBefore(div, navLinks.children[2]); 
}

// Yeni Sohbet Başlat
newChatBtn.addEventListener('click', () => {
    currentChatId = null; // ID sıfırla
    
    // Ekranı temizle
    const messages = chatContainer.querySelectorAll('.message');
    messages.forEach(msg => msg.remove());

    // Karşılamayı geri getir
    if (welcomeMessage) {
        welcomeMessage.style.display = 'block';
    }
    
    // Inputu temizle
    userInput.value = '';

    // Seçili menüyü kaldır
    document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
});


// ==========================================
// 4. MESAJLAŞMA MANTIĞI (SEND & RECEIVE)
// ==========================================

async function sendMessage() {
    const text = userInput.value.trim();
    if (!text) return;

    // İlk mesajda hoşgeldin yazısını gizle
    if (welcomeMessage) welcomeMessage.style.display = 'none';

    // Kullanıcı mesajını ekle
    addMessage('user', text);
    userInput.value = '';
    
    // Yükleniyor efekti
    const loadingId = addMessage('bot', '...', true);

    try {
        const response = await fetch('/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                message: text,
                chat_id: currentChatId // Varsa mevcut ID ile gönder
            })
        });

        const data = await response.json();
        
        // Yükleniyor mesajını kaldır
        const loadingMsg = document.getElementById(loadingId);
        if (loadingMsg) loadingMsg.remove();

        if (data.error) {
            addMessage('bot', 'Hata: ' + data.error);
        } else {
            addMessage('bot', data.response);
            
            // Eğer sunucu yeni bir ID ve Başlık oluşturduysa
            if (!currentChatId && data.chat_id) {
                currentChatId = data.chat_id;
                if (data.new_title) {
                    addChatToSidebar(data.new_title, data.chat_id);
                }
            }
        }

    } catch (error) {
        const loadingMsg = document.getElementById(loadingId);
        if (loadingMsg) loadingMsg.remove();
        addMessage('bot', 'Bir bağlantı hatası oluştu.');
    }
}

// Mesajı Ekrana Çizme ve Kopyala Butonu Ekleme
function addMessage(sender, text, isLoading = false) {
    const messageDiv = document.createElement('div');
    messageDiv.classList.add('message', sender);
    if (isLoading) messageDiv.id = 'loading-' + Date.now();

    const avatarDiv = document.createElement('div');
    avatarDiv.classList.add('avatar');
    if (sender === 'bot') {
        avatarDiv.classList.add('bot-avatar');
        avatarDiv.innerHTML = '<span class="material-symbols-outlined">smart_toy</span>';
    } else {
        avatarDiv.innerHTML = 'S';
    }

    const contentDiv = document.createElement('div');
    contentDiv.classList.add('message-content');

    if (sender === 'bot' && !isLoading) {
        // Markdown'ı HTML'e çevir
        contentDiv.innerHTML = marked.parse(text);

        // --- KOPYALA BUTONU EKLEME ---
        contentDiv.querySelectorAll('pre').forEach((pre) => {
            // 1. Buton oluştur
            const copyBtn = document.createElement('button');
            copyBtn.className = 'copy-btn';
            copyBtn.innerHTML = '<span class="material-symbols-outlined">content_copy</span>';
            copyBtn.title = "Kodu Kopyala";
            
            // 2. Tıklama olayı
            copyBtn.addEventListener('click', () => {
                const codeBlock = pre.querySelector('code');
                const codeText = codeBlock ? codeBlock.innerText : "";
                
                navigator.clipboard.writeText(codeText).then(() => {
                    copyBtn.innerHTML = '<span class="material-symbols-outlined">check</span>';
                    copyBtn.style.color = '#4caf50';
                    setTimeout(() => {
                        copyBtn.innerHTML = '<span class="material-symbols-outlined">content_copy</span>';
                        copyBtn.style.color = '#aaa';
                    }, 2000);
                });
            });

            // 3. Ekle ve Renklendir
            pre.appendChild(copyBtn);
            const code = pre.querySelector('code');
            if(code) hljs.highlightElement(code);
        });
        // -----------------------------

    } else {
        contentDiv.textContent = text;
    }

    messageDiv.appendChild(avatarDiv);
    messageDiv.appendChild(contentDiv);
    
    chatContainer.appendChild(messageDiv);
    chatContainer.scrollTop = chatContainer.scrollHeight;
    
    return messageDiv.id;
}

// Enter tuşu ile gönderme
userInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') sendMessage();
});

sendBtn.addEventListener('click', sendMessage);


// ==========================================
// 5. PYTHON PLAYGROUND (PYODIDE)
// ==========================================

// Python Motorunu Yükle
async function loadPyodideEngine() {
    outputConsole.textContent = "Python motoru yükleniyor, lütfen bekleyin...\n";
    try {
        pyodide = await loadPyodide();
        pyodideReady = true;
        outputConsole.textContent += "Python hazır! Kod yazıp çalıştırabilirsin.";
    } catch (err) {
        outputConsole.textContent = "Python yüklenirken hata oluştu: " + err;
    }
}

// Editörü Aç
openEditorBtn.addEventListener('click', () => {
    editorSection.classList.add('active');
    
    // Henüz yüklenmediyse yükle
    if (!pyodideReady) {
        loadPyodideEngine();
    }
    
    // Mobilde sidebar kapansın
    if (window.innerWidth < 1000) {
        sidebar.classList.add('collapsed');
    }
});

// Editörü Kapat
closeEditorBtn.addEventListener('click', () => {
    editorSection.classList.remove('active');
});

// Kodu Çalıştır
runCodeBtn.addEventListener('click', async () => {
    if (!pyodideReady) {
        outputConsole.textContent = "Python motoru henüz hazır değil, bekleniyor...";
        return;
    }

    const code = editor.getValue();
    outputConsole.textContent = "Çalıştırılıyor...\n";

    try {
        // Python çıktısını yakala
        pyodide.setStdout({ batched: (msg) => { outputConsole.textContent += msg + "\n"; } });
        await pyodide.runPythonAsync(code);
    } catch (err) {
        outputConsole.textContent += "\nHATA:\n" + err;
    }
});


// ==========================================
// 6. AYARLAR MODAL İŞLEMLERİ
// ==========================================

settingsBtn.addEventListener('click', () => {
    settingsModal.classList.add('active');
});

closeSettingsBtn.addEventListener('click', () => {
    settingsModal.classList.remove('active');
});

// Boşluğa tıklayınca kapat
settingsModal.addEventListener('click', (e) => {
    if (e.target === settingsModal) {
        settingsModal.classList.remove('active');
    }
});

// --- HIZLI KOMUT FONKSİYONU ---
function sendQuickMessage(message) {
    const input = document.getElementById('user-input');
    input.value = message;
    sendMessage(); // Mevcut gönderme fonksiyonunu tetikle
}
import { GoogleGenAI } from "https://esm.run/@google/genai";

// State Konfigurasi (Sudah terpasang Gemini API Key Kamu)
let config = {
    geminiKey: localStorage.getItem('cfg_gemini_key') || 'AQ.Ab8RN6KJEAFmDE6VwZ6vcUnr2T2jZJ33d_SB5YX2myQngYF9hw',
    panelUrl: localStorage.getItem('cfg_panel_url') || '',
    clientKey: localStorage.getItem('cfg_client_key') || '',
    serverId: localStorage.getItem('cfg_server_id') || ''
};

// Elemen DOM
const chatWindow = document.getElementById('chat-window');
const userInput = document.getElementById('user-input');
const sendBtn = document.getElementById('send-btn');
const settingsModal = document.getElementById('settings-modal');
const openSettingsBtn = document.getElementById('open-settings');
const closeSettingsBtn = document.getElementById('close-settings');
const saveSettingsBtn = document.getElementById('save-settings');

// Inisialisasi Pengaturan ke Form Modal
function loadConfigToModal() {
    document.getElementById('cfg-gemini-key').value = config.geminiKey;
    document.getElementById('cfg-panel-url').value = config.panelUrl;
    document.getElementById('cfg-client-key').value = config.clientKey;
    document.getElementById('cfg-server-id').value = config.serverId;
}

// Modal Event Listener
openSettingsBtn.addEventListener('click', () => {
    loadConfigToModal();
    settingsModal.classList.add('active');
});

closeSettingsBtn.addEventListener('click', () => {
    settingsModal.classList.remove('active');
});

saveSettingsBtn.addEventListener('click', () => {
    config.geminiKey = document.getElementById('cfg-gemini-key').value.trim();
    config.panelUrl = document.getElementById('cfg-panel-url').value.trim().replace(/\/$/, "");
    config.clientKey = document.getElementById('cfg-client-key').value.trim();
    config.serverId = document.getElementById('cfg-server-id').value.trim();

    localStorage.setItem('cfg_gemini_key', config.geminiKey);
    localStorage.setItem('cfg_panel_url', config.panelUrl);
    localStorage.setItem('cfg_client_key', config.clientKey);
    localStorage.setItem('cfg_server_id', config.serverId);

    settingsModal.classList.remove('active');
    appendMessage('Sistem', 'Konfigurasi berhasil disimpan!', 'ai');
});

// Fungsi Permintaan ke Pterodactyl API
async function callPterodactylAPI(endpoint, method = 'POST', body = null) {
    if (!config.panelUrl || !config.clientKey || !config.serverId) {
        throw new Error('Konfigurasi Pterodactyl belum lengkap. Isikan URL, Client Key, dan Server ID di menu pengaturan (tombol ⚙️)!');
    }

    const url = `${config.panelUrl}/api/client/servers/${config.serverId}${endpoint}`;
    const options = {
        method: method,
        headers: {
            'Authorization': `Bearer ${config.clientKey}`,
            'Content-Type': 'application/json',
            'Accept': 'Application/vnd.pterodactyl.v1+json'
        }
    };

    if (body) {
        options.body = JSON.stringify(body);
    }

    const response = await fetch(url, options);
    if (!response.ok) {
        throw new Error(`HTTP Error: ${response.status} ${response.statusText}`);
    }

    if (response.status === 204) return "Perintah berhasil dikirim ke server.";
    return await response.json();
}

// Definisi Tools Gemini AI
const tools = [
    {
        name: 'send_power_signal',
        description: 'Mengirim sinyal daya ke server (start, stop, restart, kill)',
        parameters: {
            type: 'OBJECT',
            properties: {
                signal: { type: 'STRING', description: 'Nilai: start, stop, restart, atau kill' }
            },
            required: ['signal']
        },
        execute: async (args) => {
            await callPterodactylAPI('/power', 'POST', { signal: args.signal });
            return `Sinyal daya '${args.signal}' berhasil dikirim ke server.`;
        }
    },
    {
        name: 'send_command',
        description: 'Mengirim perintah konsol ke server Minecraft/Pterodactyl',
        parameters: {
            type: 'OBJECT',
            properties: {
                command: { type: 'STRING', description: 'Perintah konsol (contoh: say Halo, op Player)' }
            },
            required: ['command']
        },
        execute: async (args) => {
            await callPterodactylAPI('/command', 'POST', { command: args.command });
            return `Perintah '${args.command}' telah dikirim ke konsol.`;
        }
    }
];

// Kirim Pesan & Olah AI
async function handleUserMessage() {
    const text = userInput.value.trim();
    if (!text) return;

    appendMessage('Anda', text, 'user');
    userInput.value = '';

    if (!config.geminiKey) {
        appendMessage('AI', 'Silakan masukkan Gemini API Key di menu pengaturan terlebih dahulu!', 'ai');
        return;
    }

    try {
        const ai = new GoogleGenAI({ apiKey: config.geminiKey });
        
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            config: {
                systemInstruction: "Kamu adalah asisten pengelola server Pterodactyl. Gunakan fungsi/tools yang tersedia untuk mengeksekusi perintah daya atau konsol sesuai instruksi pengguna.",
                tools: [{
                    functionDeclarations: tools.map(t => ({
                        name: t.name,
                        description: t.description,
                        parameters: t.parameters
                    }))
                }]
            },
            contents: text
        });

        if (response.functionCalls && response.functionCalls.length > 0) {
            const call = response.functionCalls[0];
            const tool = tools.find(t => t.name === call.name);
            if (tool) {
                appendMessage('AI', `Menjalankan aksi: ${call.name}...`, 'ai');
                const result = await tool.execute(call.args);
                appendMessage('AI', result, 'ai');
            }
        } else if (response.text) {
            appendMessage('AI', response.text, 'ai');
        } else {
            appendMessage('AI', 'Maaf, saya tidak mengerti instruksi tersebut.', 'ai');
        }

    } catch (err) {
        appendMessage('AI', `Gagal memproses: ${err.message}`, 'ai');
    }
}

// Handler Tombol Aksi Cepat Daya
window.handlePower = async function(signal) {
    appendMessage('Anda', `[Aksi Cepat] Kirim sinyal daya: ${signal}`, 'user');
    try {
        await callPterodactylAPI('/power', 'POST', { signal: signal });
        appendMessage('Sistem', `Sinyal daya '${signal}' berhasil dikirim.`, 'ai');
    } catch (err) {
        appendMessage('Sistem', `Gagal: ${err.message}`, 'ai');
    }
};

// Utilitas Tambah Pesan ke UI
function appendMessage(sender, message, type) {
    const msgDiv = document.createElement('div');
    msgDiv.className = `message ${type}`;

    const icon = type === 'ai' ? '<i class="fa-solid fa-robot msg-icon"></i>' : '';
    msgDiv.innerHTML = `
        ${icon}
        <div class="msg-content">${message}</div>
    `;

    chatWindow.appendChild(msgDiv);
    chatWindow.scrollTop = chatWindow.scrollHeight;
}

// Event Listeners Input
sendBtn.addEventListener('click', handleUserMessage);
userInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') handleUserMessage();
});
  

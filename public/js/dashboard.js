// Dashboard JavaScript
let socket;
let qrCodeInstance;
let SERVER_URL;

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    initSocket();
    initQRCode();
    setupEventListeners();
});

function initSocket() {
    // Déterminer l'URL du serveur (priorité à la config injectée par /config.js)
    SERVER_URL = (window.PORTER_CONFIG && window.PORTER_CONFIG.SERVER_URL) || window.location.origin;

    socket = io(SERVER_URL, { transports: ['websocket', 'polling'] });
    
    socket.on('connect', () => {
        console.log('Connecté au serveur');
        updateConnectionStatus(true);
        
        // S'enregistrer comme dashboard
        socket.emit('register-device', {
            type: 'dashboard',
            name: 'Dashboard Principal'
        });
        
        showNotification('✅ Connecté au serveur', 'success');
    });
    
    socket.on('disconnect', () => {
        console.log('Déconnecté du serveur');
        updateConnectionStatus(false);
        showNotification('⚠️ Connexion perdue', 'warning');
    });
    
    // Recevoir les mises à jour de note
    socket.on('note-update', (data) => {
        console.log('Nouvelle note reçue:', data);
        updateNoteDisplay(data);
    });
    
    // Mise à jour de la liste des appareils
    socket.on('devices-update', (devices) => {
        console.log('Appareils mis à jour:', devices);
        updateDevicesList(devices);
    });
}

function initQRCode() {
    const monitorUrl = SERVER_URL.replace(/\/$/, '') + '/monitor';
    const qrContainer = document.getElementById('qrCode');
    const linkBox = document.getElementById('monitorLink');
    
    // Générer le QR Code
    qrCodeInstance = new QRCode(qrContainer, {
        text: monitorUrl,
        width: 200,
        height: 200,
        colorDark: '#111827',
        colorLight: '#ffffff',
        correctLevel: QRCode.CorrectLevel.H
    });
    
    // Afficher le lien
    linkBox.textContent = monitorUrl;
}

function setupEventListeners() {
    const refreshBtn = document.getElementById('refreshBtn');
    refreshBtn.addEventListener('click', () => {
        // Demander une mise à jour (optionnel)
        showNotification('🔄 Actualisation...', 'info');
    });
}

function updateConnectionStatus(connected) {
    const statusBadge = document.getElementById('device-status');
    if (connected) {
        statusBadge.textContent = 'Connecté';
        statusBadge.classList.add('online');
    } else {
        statusBadge.textContent = 'Déconnecté';
        statusBadge.classList.remove('online');
    }
}

function updateNoteDisplay(data) {
    const noteValue = document.getElementById('noteValue');
    const freqValue = document.getElementById('freqValue');
    const centsValue = document.getElementById('centsValue');

    const note = data && data.note ? data.note : '--';
    const freq = data && data.frequency ? `${data.frequency.toFixed(1)} Hz` : '--';
    const cents = data && typeof data.cents === 'number' ? `${data.cents > 0 ? '+' : ''}${Math.round(data.cents)} cents` : '--';

    noteValue.textContent = note;
    freqValue.textContent = freq;
    centsValue.textContent = cents;

    showNotification(`🎵 Nouvelle note: ${note} (${freq})`, 'success');
}

function updateDevicesList(devices) {
    const devicesList = document.getElementById('devicesList');
    
    if (!devices || devices.length === 0) {
        devicesList.innerHTML = '<p class="empty-state">Aucun appareil connecté</p>';
        return;
    }
    
    devicesList.innerHTML = devices.map(device => {
        const icon = device.type === 'monitor' ? '🎤' : '📱';
        const typeLabel = device.type === 'monitor' ? 'Moniteur' : 'Dashboard';
        
        return `
            <div class="device-item">
                <div class="device-icon">${icon}</div>
                <div class="device-info">
                    <div class="device-name">${device.name}</div>
                    <div class="device-type">${typeLabel} • Connecté</div>
                </div>
            </div>
        `;
    }).join('');
}

function showNotification(message, type = 'info') {
    const notification = document.getElementById('notification');
    notification.textContent = message;
    notification.classList.add('show');
    
    setTimeout(() => {
        notification.classList.remove('show');
    }, 3000);
}

// Dashboard JavaScript
let socket;
let qrCodeInstance;

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    initSocket();
    initQRCode();
    setupEventListeners();
});

function initSocket() {
    socket = io();
    
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
    
    // Recevoir les mises à jour de score
    socket.on('score-update', (data) => {
        console.log('Nouveau score reçu:', data);
        updateScoreDisplay(data);
    });
    
    // Mise à jour de la liste des appareils
    socket.on('devices-update', (devices) => {
        console.log('Appareils mis à jour:', devices);
        updateDevicesList(devices);
    });
}

function initQRCode() {
    const monitorUrl = window.location.origin + '/monitor';
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

function updateScoreDisplay(data) {
    const scoreValue = document.getElementById('scoreValue');
    const scoreStatus = document.getElementById('scoreStatus');
    const analysisDetails = document.getElementById('analysisDetails');
    
    // Afficher le score
    scoreValue.textContent = data.score;
    
    // Déterminer le statut
    let status = '';
    let statusClass = '';
    
    if (data.score >= 80) {
        status = '✅ Excellent';
        statusClass = 'excellent';
    } else if (data.score >= 60) {
        status = '👍 Bon';
        statusClass = 'good';
    } else if (data.score >= 40) {
        status = '⚠️ Moyen';
        statusClass = 'average';
    } else {
        status = '❌ Faible';
        statusClass = 'poor';
    }
    
    scoreStatus.textContent = status;
    scoreStatus.className = 'score-status ' + statusClass;
    
    // Afficher les détails d'analyse si disponibles
    if (data.analysis) {
        analysisDetails.classList.remove('hidden');
        document.getElementById('volumeLevel').textContent = data.analysis.volume || '--';
        document.getElementById('noiseLevel').textContent = data.analysis.noise || '--';
        document.getElementById('frequencyRange').textContent = data.analysis.frequency || '--';
    }
    
    showNotification(`📊 Nouveau score: ${data.score}`, 'success');
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

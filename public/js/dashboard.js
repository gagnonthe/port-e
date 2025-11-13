// Dashboard JavaScript
let socket;
let qrCodeInstance;
let SERVER_URL;
let VF; // VexFlow namespace
let staffRenderer = null;
let vexflowRetryTimer = null;
let vexflowTries = 0;

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    initSocket();
    initQRCode();
    initStaff();
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
        if (data && data.note) {
            renderNoteOnStaff(data.note);
        }
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

function initStaff() {
    const container = document.getElementById('staff');
    if (!container) return;
    if (!window.Vex || !window.Vex.Flow) {
        // Affiche un message et tente plusieurs fois pendant ~10s
        container.innerHTML = '<div style="color:#9ca3af; font-size: 0.875rem; padding: 0.5rem;">Chargement de la notation musicale… (VexFlow)</div>';
        if (!vexflowRetryTimer) {
            vexflowRetryTimer = setInterval(() => {
                vexflowTries += 1;
                if (window.Vex && window.Vex.Flow) {
                    clearInterval(vexflowRetryTimer);
                    vexflowRetryTimer = null;
                    VF = window.Vex.Flow;
                    renderGrandStaff(null);
                } else if (vexflowTries > 20) { // ~10s à 500ms
                    clearInterval(vexflowRetryTimer);
                    vexflowRetryTimer = null;
                    container.innerHTML = '<div style="color:#ef4444; font-size: 0.875rem; padding: 0.5rem;">Erreur: VexFlow n\'a pas pu être chargé. Vérifiez votre connexion réseau.</div>';
                }
            }, 500);
        }
        return;
    }
    VF = window.Vex.Flow;
    // Initial render with no note
    renderGrandStaff(null);
}

function clearElement(el) {
    while (el.firstChild) el.removeChild(el.firstChild);
}

function renderGrandStaff(noteStr) {
    const container = document.getElementById('staff');
    if (!container) return;
    clearElement(container);

    const width = 500;
    const height = 220;
    const padding = 20;

    const renderer = new VF.Renderer(container, VF.Renderer.Backends.SVG);
    renderer.resize(width, height);
    const context = renderer.getContext();
    context.setFont('Arial', 10, '').setBackgroundFillStyle('#FFF');

    const treble = new VF.Stave(padding, padding, width - padding * 2);
    treble.addClef('treble');
    treble.setContext(context).draw();

    const bass = new VF.Stave(padding, padding + 90, width - padding * 2);
    bass.addClef('bass');
    bass.setContext(context).draw();

    // Connectors (brace and lines)
    const brace = new VF.StaveConnector(treble, bass);
    brace.setType(VF.StaveConnector.type.BRACE);
    brace.setContext(context).draw();

    const lineLeft = new VF.StaveConnector(treble, bass);
    lineLeft.setType(VF.StaveConnector.type.SINGLE_LEFT);
    lineLeft.setContext(context).draw();

    const lineRight = new VF.StaveConnector(treble, bass);
    lineRight.setType(VF.StaveConnector.type.SINGLE_RIGHT);
    lineRight.setContext(context).draw();

    if (noteStr) {
        const clef = chooseClef(noteStr);
        const key = toVFKey(noteStr);
        const hasSharp = /#/.test(noteStr);

        const note = new VF.StaveNote({ clef, keys: [key], duration: 'q' });
        if (hasSharp) note.addAccidental(0, new VF.Accidental('#'));

        const voice = new VF.Voice({ num_beats: 1, beat_value: 4 });
        voice.addTickables([note]);

        new VF.Formatter().joinVoices([voice]).format([voice], width - padding * 2 - 40);

        if (clef === 'treble') {
            voice.draw(context, treble);
        } else {
            voice.draw(context, bass);
        }
    }

    staffRenderer = { renderer, context };
}

function renderNoteOnStaff(noteStr) {
    if (!window.Vex || !window.Vex.Flow) return;
    renderGrandStaff(noteStr);
}

function toVFKey(noteStr) {
    // Convertit "A#4" -> "a#/4"
    const m = /^([A-Ga-g])(#?)(-?\d+)$/.exec(noteStr);
    if (!m) return 'c/4';
    const letter = m[1].toLowerCase();
    const sharp = m[2] ? '#' : '';
    const oct = m[3];
    return `${letter}${sharp}/${oct}`;
}

function noteToMidi(noteStr) {
    const m = /^([A-Ga-g])(#?)(-?\d+)$/.exec(noteStr);
    if (!m) return 60; // C4 par défaut
    const name = m[1].toUpperCase() + (m[2] || '');
    const oct = parseInt(m[3], 10);
    const semis = { C: 0, 'C#': 1, D: 2, 'D#': 3, E: 4, F: 5, 'F#': 6, G: 7, 'G#': 8, A: 9, 'A#': 10, B: 11 };
    const semi = semis[name] ?? 0;
    return 12 * (oct + 1) + semi;
}

function chooseClef(noteStr) {
    const midi = noteToMidi(noteStr);
    // C4 (60) et au-dessus -> treble, sinon -> bass
    return midi >= 60 ? 'treble' : 'bass';
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

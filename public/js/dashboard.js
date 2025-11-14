// Dashboard JavaScript
let socket;
let qrCodeInstance;
let SERVER_URL;
let VF; // VexFlow namespace
let staffRenderer = null;
let vexflowRetryTimer = null;
let vexflowTries = 0;
let simpleStaffMode = false; // fallback sans librairie
let noteHistory = []; // Historique des notes détectées
const MAX_NOTES_ON_STAFF = 8; // Nombre max de notes affichées sur la portée

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
                    renderGrandStaff([]);
                } else if (vexflowTries > 20) { // ~10s à 500ms
                    clearInterval(vexflowRetryTimer);
                    vexflowRetryTimer = null;
                    // Basculer en mode simple (SVG maison)
                    simpleStaffMode = true;
                    renderSimpleGrandStaff([]);
                }
            }, 500);
        }
        return;
    }
    VF = window.Vex.Flow;
    // Initial render with empty notes array (displays both clefs)
    renderGrandStaff([]);
}

function clearElement(el) {
    while (el.firstChild) el.removeChild(el.firstChild);
}

function renderGrandStaff(noteArray) {
    const container = document.getElementById('staff');
    if (!container) return;
    clearElement(container);

    const width = 600;
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

    // Afficher toutes les notes accumulées
    if (noteArray && noteArray.length > 0) {
        const trebleNotes = [];
        const bassNotes = [];
        
        noteArray.forEach(noteStr => {
            const clef = chooseClef(noteStr);
            const key = toVFKey(noteStr);
            const hasSharp = /#/.test(noteStr);

            const note = new VF.StaveNote({ clef, keys: [key], duration: 'q' });
            if (hasSharp) note.addAccidental(0, new VF.Accidental('#'));
            
            if (clef === 'treble') {
                trebleNotes.push(note);
            } else {
                bassNotes.push(note);
            }
        });
        
        // Rendre les notes de la clé de sol
        if (trebleNotes.length > 0) {
            const trebleVoice = new VF.Voice({ num_beats: trebleNotes.length, beat_value: 4 });
            trebleVoice.addTickables(trebleNotes);
            new VF.Formatter().joinVoices([trebleVoice]).format([trebleVoice], width - padding * 2 - 60);
            trebleVoice.draw(context, treble);
        }
        
        // Rendre les notes de la clé de fa
        if (bassNotes.length > 0) {
            const bassVoice = new VF.Voice({ num_beats: bassNotes.length, beat_value: 4 });
            bassVoice.addTickables(bassNotes);
            new VF.Formatter().joinVoices([bassVoice]).format([bassVoice], width - padding * 2 - 60);
            bassVoice.draw(context, bass);
        }
    }

    staffRenderer = { renderer, context };
}

function renderNoteOnStaff(noteStr) {
    // Ajouter la note à l'historique
    if (noteStr) {
        noteHistory.push(noteStr);
        // Limiter le nombre de notes (effet défilement)
        if (noteHistory.length > MAX_NOTES_ON_STAFF) {
            noteHistory.shift(); // Supprimer la plus ancienne
        }
    }
    
    // Rendre toutes les notes accumulées
    if (simpleStaffMode || !window.Vex || !window.Vex.Flow) {
        renderSimpleGrandStaff(noteHistory);
    } else {
        renderGrandStaff(noteHistory);
    }
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

// ------------------------------
// Fallback simple: rendu SVG maison
// ------------------------------

function renderSimpleGrandStaff(noteArray) {
    const container = document.getElementById('staff');
    if (!container) return;
    clearElement(container);

    const width = 600;
    const height = 220;
    const padding = 20;
    const lineSpacing = 12; // distance entre lignes

    const svgNS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(svgNS, 'svg');
    svg.setAttribute('width', width);
    svg.setAttribute('height', height);
    svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
    svg.style.display = 'block';

    // Dessine 5 lignes pour treble et bass
    const trebleTop = padding;
    const bassTop = padding + 90;
    drawStaffLines(svg, padding, trebleTop, width - padding * 2, lineSpacing);
    drawStaffLines(svg, padding, bassTop, width - padding * 2, lineSpacing);

    // Traits verticaux gauche/droite
    line(svg, padding, trebleTop, padding, trebleTop + lineSpacing * 4, 2);
    line(svg, padding, bassTop, padding, bassTop + lineSpacing * 4, 2);
    line(svg, width - padding, trebleTop, width - padding, trebleTop + lineSpacing * 4, 2);
    line(svg, width - padding, bassTop, width - padding, bassTop + lineSpacing * 4, 2);

    // Liaison verticale à gauche (simple)
    line(svg, padding - 6, trebleTop, padding - 6, bassTop + lineSpacing * 4, 2);
    
    // Afficher les clés de sol et de fa
    drawClefSymbol(svg, padding + 10, trebleTop, 'treble');
    drawClefSymbol(svg, padding + 10, bassTop, 'bass');

    // Dessiner toutes les notes accumulées
    if (noteArray && noteArray.length > 0) {
        const noteSpacing = Math.min(60, (width - padding * 2 - 80) / Math.max(1, noteArray.length));
        
        noteArray.forEach((noteStr, index) => {
            const clef = chooseClef(noteStr);
            const pos = computeNoteYPosition(noteStr, { trebleTop, bassTop, lineSpacing, padding });
            const cx = padding + 50 + index * noteSpacing; // Espacement horizontal
            const cy = pos.y;
            
            // Note head (ellipse) avec animation
            const ellipse = document.createElementNS(svgNS, 'ellipse');
            ellipse.setAttribute('cx', cx);
            ellipse.setAttribute('cy', cy);
            ellipse.setAttribute('rx', 7);
            ellipse.setAttribute('ry', 5);
            ellipse.setAttribute('fill', 'var(--note-fill, #2C2C2C)');
            ellipse.setAttribute('class', 'note-head note-anim');
            svg.appendChild(ellipse);

            // Ledger lines si nécessaire
            drawLedgerLines(svg, cx, noteStr, { trebleTop, bassTop, lineSpacing, padding });

            // Altération (dièse)
            if (/#[0-9]?$/.test(noteStr)) {
                const text = document.createElementNS(svgNS, 'text');
                text.setAttribute('x', cx - 16);
                text.setAttribute('y', cy + 4);
                text.setAttribute('fill', 'var(--fg-music, #2C2C2C)');
                text.setAttribute('font-size', '14');
                text.setAttribute('font-family', 'Arial, sans-serif');
                text.textContent = '#';
                svg.appendChild(text);
            }

            // Tige vers le haut / bas selon clé/position
            const stemUp = clef === 'bass' || pos.step < 4;
            const stemX = stemUp ? cx + 7 : cx - 7;
            const stemY1 = cy;
            const stemY2 = stemUp ? cy - 30 : cy + 30;
            line(svg, stemX, stemY1, stemX, stemY2, 2);
        });
    }

    container.appendChild(svg);
}

function drawClefSymbol(svg, x, y, clefType) {
    const svgNS = 'http://www.w3.org/2000/svg';
    const text = document.createElementNS(svgNS, 'text');
    text.setAttribute('x', x);
    text.setAttribute('y', y + 40);
    text.setAttribute('fill', 'var(--fg-music, #2C2C2C)');
    text.setAttribute('font-size', clefType === 'treble' ? '48' : '36');
    text.setAttribute('font-family', 'serif');
    text.setAttribute('font-weight', 'bold');
    // Utiliser des caractères Unicode pour les clés musicales
    text.textContent = clefType === 'treble' ? '𝄞' : '𝄢'; // Treble clef, Bass clef
    svg.appendChild(text);
}

function drawStaffLines(svg, x, topY, width, spacing) {
    for (let i = 0; i < 5; i++) {
        const y = topY + i * spacing;
        line(svg, x, y, x + width, y, 1);
    }
}

function line(svg, x1, y1, x2, y2, strokeWidth = 1) {
    const svgNS = 'http://www.w3.org/2000/svg';
    const l = document.createElementNS(svgNS, 'line');
    l.setAttribute('x1', x1);
    l.setAttribute('y1', y1);
    l.setAttribute('x2', x2);
    l.setAttribute('y2', y2);
    l.setAttribute('stroke', '#111827');
    l.setAttribute('stroke-width', strokeWidth);
    l.setAttribute('stroke-linecap', 'round');
    svg.appendChild(l);
}

function computeNoteYPosition(noteStr, geom) {
    const { trebleTop, bassTop, lineSpacing } = geom;
    const clef = chooseClef(noteStr);
    const midi = noteToMidi(noteStr);
    const refTreble = diatonicIndex('E', 4); // E4 bottom line treble
    const refBass = diatonicIndex('G', 2);   // G2 bottom line bass
    const ref = clef === 'treble' ? refTreble : refBass;
    const idx = diatonicFromMidi(midi);
    const step = idx - ref; // 0..8 dans la portée, <0 ou >8 hors
    const bottomY = (clef === 'treble' ? trebleTop : bassTop) + lineSpacing * 4; // y de la 5e ligne
    const y = bottomY - step * (lineSpacing / 2);
    return { y, step };
}

function drawLedgerLines(svg, cx, noteStr, geom) {
    const { trebleTop, bassTop, lineSpacing, padding } = geom;
    const clef = chooseClef(noteStr);
    const midi = noteToMidi(noteStr);
    const refTreble = diatonicIndex('E', 4);
    const refBass = diatonicIndex('G', 2);
    const ref = clef === 'treble' ? refTreble : refBass;
    const idx = diatonicFromMidi(midi);
    const step = idx - ref;
    const topY = clef === 'treble' ? trebleTop : bassTop; // y de la 1re ligne
    const bottomY = topY + lineSpacing * 4; // y de la 5e ligne

    // Fonctions utilitaires
    const isLineStep = (s) => s % 2 === 0; // 0,2,4,6,8 sont des lignes
    const ledgerWidth = 24;

    // Au-dessus de la portée
    for (let s = 9; s <= step; s++) {
        if (isLineStep(s)) {
            const y = bottomY - s * (lineSpacing / 2);
            line(svg, cx - ledgerWidth / 2, y, cx + ledgerWidth / 2, y, 1.5);
        }
    }
    // En-dessous de la portée
    for (let s = -1; s >= step; s--) {
        if (isLineStep(s)) {
            const y = bottomY - s * (lineSpacing / 2);
            line(svg, cx - ledgerWidth / 2, y, cx + ledgerWidth / 2, y, 1.5);
        }
    }
}

function diatonicIndex(letter, octave) {
    const map = { C: 0, D: 1, E: 2, F: 3, G: 4, A: 5, B: 6 };
    return 7 * octave + map[letter];
}

function diatonicFromMidi(midi) {
    // Convertir midi -> (letter, octave) diatonique approx.
    // D'abord midi -> note nom sans altération (plus proche) pour les pas diatoniques
    const names = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    const name = names[midi % 12];
    const octave = Math.floor(midi / 12) - 1;
    const baseLetter = name.replace('#', ''); // ignorer altérations pour l'index diatonique
    return diatonicIndex(baseLetter, octave);
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

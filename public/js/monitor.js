// Monitor JavaScript
let socket;
let audioContext;
let analyser;
let microphone;
let dataArray;
let isMonitoring = false;
let animationId;
let analysisInterval;
let pitchInterval;
let SERVER_URL;

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    initSocket();
    setupEventListeners();
    initVisualizer();
});

function initSocket() {
    // Déterminer l'URL du serveur (priorité à la config injectée par /config.js)
    SERVER_URL = (window.PORTER_CONFIG && window.PORTER_CONFIG.SERVER_URL) || window.location.origin;
    socket = io(SERVER_URL, { transports: ['websocket', 'polling'] });
    
    socket.on('connect', () => {
        console.log('Moniteur connecté au serveur');
        updateConnectionStatus(true);
        
        // S'enregistrer comme moniteur
        socket.emit('register-device', {
            type: 'monitor',
            name: 'Moniteur Audio ' + Math.floor(Math.random() * 1000)
        });
        
        showNotification('✅ Connecté au serveur', 'success');
    });
    
    socket.on('disconnect', () => {
        console.log('Moniteur déconnecté');
        updateConnectionStatus(false);
        if (isMonitoring) {
            stopMonitoring();
        }
        showNotification('⚠️ Connexion perdue', 'warning');
    });
    
    // Recevoir les commandes de contrôle
    socket.on('monitoring-control', (command) => {
        if (command === 'start' && !isMonitoring) {
            startMonitoring();
        } else if (command === 'stop' && isMonitoring) {
            stopMonitoring();
        }
    });
}

function setupEventListeners() {
    const monitorButton = document.getElementById('monitorButton');
    monitorButton.addEventListener('click', toggleMonitoring);
}

function initVisualizer() {
    const visualizer = document.getElementById('audioVisualizer');
    // Créer 32 barres pour le visualiseur
    for (let i = 0; i < 32; i++) {
        const bar = document.createElement('div');
        bar.className = 'visualizer-bar';
        visualizer.appendChild(bar);
    }
}

async function toggleMonitoring() {
    if (isMonitoring) {
        stopMonitoring();
    } else {
        await startMonitoring();
    }
}

async function startMonitoring() {
    try {
        // Demander l'accès au microphone
        const stream = await navigator.mediaDevices.getUserMedia({ 
            audio: {
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: false
            } 
        });
        
        // Créer le contexte audio
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        analyser = audioContext.createAnalyser();
        microphone = audioContext.createMediaStreamSource(stream);
        
        analyser.fftSize = 2048; // meilleure résolution temporelle pour la détection de pitch
        const bufferLength = analyser.frequencyBinCount;
        dataArray = new Uint8Array(bufferLength);
        
        microphone.connect(analyser);
        
        isMonitoring = true;
        updateMonitorUI(true);
        
        // Démarrer l'analyse
        startAnalysis(); // métriques/visualiseur
        startPitchDetection(); // notes en temps réel
        
        // Démarrer la visualisation
        visualize();
        
        showNotification('🎤 Analyse démarrée', 'success');
        
    } catch (error) {
        console.error('Erreur d\'accès au microphone:', error);
        showNotification('❌ Erreur d\'accès au microphone', 'error');
        document.getElementById('permissionNotice').classList.remove('hidden');
    }
}

function stopMonitoring() {
    if (audioContext) {
        audioContext.close();
    }
    
    if (animationId) {
        cancelAnimationFrame(animationId);
    }
    
    if (analysisInterval) {
        clearInterval(analysisInterval);
    }
    if (pitchInterval) {
        clearInterval(pitchInterval);
    }
    
    isMonitoring = false;
    updateMonitorUI(false);
    
    showNotification('⏸️ Analyse arrêtée', 'info');
}

function startAnalysis() {
    // Analyser l'audio toutes les 2 secondes
    analysisInterval = setInterval(() => {
        if (!isMonitoring) return;
        
        analyser.getByteFrequencyData(dataArray);
        
        // Calculer les métriques (conservé pour visualisation locale)
        const analysis = analyzeAudioData(dataArray);
        
        // Mettre à jour l'UI locale (métriques)
        updateMetricsForDebug(analysis);
        
    }, 2000);
}

function startPitchDetection() {
    const timeDomainBuffer = new Float32Array(analyser.fftSize);
    pitchInterval = setInterval(() => {
        if (!isMonitoring) return;

        analyser.getFloatTimeDomainData(timeDomainBuffer);
        const freq = detectPitch(timeDomainBuffer, audioContext.sampleRate);
        if (freq && isFinite(freq) && freq > 20 && freq < 5000) {
            const noteInfo = frequencyToNote(freq);
            // Envoyer au serveur: note en temps réel
            socket.emit('note-data', noteInfo);

            // Mettre à jour l'UI locale (note)
            updateNoteLocal(noteInfo);
            addNoteToLog(noteInfo);
        }
    }, 150);
}

// Détection de pitch par autocorrélation simple
function detectPitch(buffer, sampleRate) {
    // Normaliser (enlever DC offset)
    let size = buffer.length;
    let rms = 0;
    for (let i = 0; i < size; i++) {
        const val = buffer[i];
        rms += val * val;
    }
    rms = Math.sqrt(rms / size);
    if (rms < 0.01) return null; // trop silencieux

    let r1 = 0, r2 = size - 1, thres = 0.2;
    for (let i = 0; i < size / 2; i++) {
        if (Math.abs(buffer[i]) < thres) { r1 = i; break; }
    }
    for (let i = 1; i < size / 2; i++) {
        if (Math.abs(buffer[size - i]) < thres) { r2 = size - i; break; }
    }
    buffer = buffer.slice(r1, r2);
    size = buffer.length;

    const autocorr = new Float32Array(size);
    for (let lag = 0; lag < size; lag++) {
        let sum = 0;
        for (let i = 0; i < size - lag; i++) {
            sum += buffer[i] * buffer[i + lag];
        }
        autocorr[lag] = sum;
    }

    let d = 0; while (d < size && autocorr[d] > autocorr[d + 1]) d++;
    let maxPos = d, maxVal = -1;
    for (let i = d; i < size; i++) {
        if (autocorr[i] > maxVal) {
            maxVal = autocorr[i];
            maxPos = i;
        }
    }
    if (maxPos === 0) return null;

    // Interpolation parabolique pour une meilleure précision
    const x0 = autocorr[maxPos - 1] || 0;
    const x1 = autocorr[maxPos];
    const x2 = autocorr[maxPos + 1] || 0;
    const shift = (x2 - x0) / (2 * (2 * x1 - x2 - x0));
    const period = maxPos + shift;
    const frequency = sampleRate / period;
    return frequency;
}

function frequencyToNote(frequency) {
    const A4 = 440;
    const noteNumber = 12 * Math.log2(frequency / A4) + 69;
    const nearest = Math.round(noteNumber);
    const names = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    const name = names[(nearest + 1200) % 12];
    const octave = Math.floor(nearest / 12) - 1;
    const cents = 100 * (noteNumber - nearest);
    return {
        note: `${name}${octave}`,
        frequency: frequency,
        cents: cents
    };
}

function analyzeAudioData(dataArray) {
    // Calculer le volume moyen
    let sum = 0;
    for (let i = 0; i < dataArray.length; i++) {
        sum += dataArray[i];
    }
    const average = sum / dataArray.length;
    
    // Convertir en décibels approximatifs
    const volume = Math.round(20 * Math.log10(average / 255) + 60);
    
    // Analyser les fréquences
    const lowFreq = dataArray.slice(0, 32).reduce((a, b) => a + b, 0) / 32;
    const midFreq = dataArray.slice(32, 96).reduce((a, b) => a + b, 0) / 64;
    const highFreq = dataArray.slice(96, 128).reduce((a, b) => a + b, 0) / 32;
    
    // Déterminer la plage dominante
    let frequencyRange = 'Bas';
    if (midFreq > lowFreq && midFreq > highFreq) {
        frequencyRange = 'Moyen';
    } else if (highFreq > lowFreq && highFreq > midFreq) {
        frequencyRange = 'Haut';
    }
    
    // Niveau de bruit (variabilité)
    let variance = 0;
    for (let i = 0; i < dataArray.length; i++) {
        variance += Math.pow(dataArray[i] - average, 2);
    }
    variance = Math.sqrt(variance / dataArray.length);
    const noiseLevel = variance < 10 ? 'Faible' : variance < 30 ? 'Moyen' : 'Élevé';
    
    return {
        volume: volume,
        noise: noiseLevel,
        frequency: frequencyRange,
        rawAverage: average,
        rawVariance: variance
    };
}

function calculateEnvironmentScore(analysis) {
    let score = 100;
    
    // Pénalité pour volume élevé
    if (analysis.volume > 70) {
        score -= (analysis.volume - 70) * 2;
    }
    
    // Pénalité pour bruit élevé
    if (analysis.noise === 'Élevé') {
        score -= 30;
    } else if (analysis.noise === 'Moyen') {
        score -= 15;
    }
    
    // Bonus pour environnement calme
    if (analysis.volume < 40 && analysis.noise === 'Faible') {
        score = Math.min(100, score + 10);
    }
    
    return Math.max(0, Math.min(100, Math.round(score)));
}

function visualize() {
    if (!isMonitoring) return;
    
    animationId = requestAnimationFrame(visualize);
    
    analyser.getByteFrequencyData(dataArray);
    
    const bars = document.querySelectorAll('.visualizer-bar');
    const step = Math.floor(dataArray.length / bars.length);
    
    bars.forEach((bar, index) => {
        const value = dataArray[index * step];
        const height = (value / 255) * 100;
        bar.style.height = height + '%';
    });
}

function updateMonitorUI(active) {
    const button = document.getElementById('monitorButton');
    const label = document.getElementById('controlLabel');
    const statusBadge = document.getElementById('monitorStatus');
    const visualizerSection = document.getElementById('visualizerSection');
    
    if (active) {
        button.className = 'control-button stop';
        button.textContent = '⏹️';
        label.textContent = 'Arrêter l\'analyse';
        statusBadge.classList.add('recording');
        statusBadge.textContent = 'En cours';
        visualizerSection.classList.remove('hidden');
    } else {
        button.className = 'control-button start';
        button.textContent = '🎤';
        label.textContent = 'Démarrer l\'analyse';
        statusBadge.classList.remove('recording');
        visualizerSection.classList.add('hidden');
    }
}

function updateConnectionStatus(connected) {
    const statusBadge = document.getElementById('monitorStatus');
    if (connected && !isMonitoring) {
        statusBadge.textContent = 'Connecté';
        statusBadge.classList.add('online');
        statusBadge.classList.remove('recording');
    } else if (!connected) {
        statusBadge.textContent = 'Déconnecté';
        statusBadge.classList.remove('online', 'recording');
    }
}

function updateMetricsForDebug(analysis) {
    // Ces métriques sont conservées à titre indicatif/local (non envoyées au dashboard)
    const volEl = document.getElementById('volumeMetric');
    const noiseEl = document.getElementById('noiseMetric');
    const freqEl = document.getElementById('frequencyMetric');
    if (volEl) volEl.textContent = `${analysis.volume} dB`;
    if (noiseEl) noiseEl.textContent = analysis.noise;
    if (freqEl) freqEl.textContent = analysis.frequency;
}

function updateNoteLocal(noteInfo) {
    const el = document.getElementById('currentNote');
    const f = document.getElementById('currentFreq');
    const c = document.getElementById('currentCents');
    if (el) el.textContent = noteInfo.note || '--';
    if (f) f.textContent = noteInfo.frequency ? `${noteInfo.frequency.toFixed(1)} Hz` : '--';
    if (c) c.textContent = typeof noteInfo.cents === 'number' ? `${noteInfo.cents > 0 ? '+' : ''}${Math.round(noteInfo.cents)} cents` : '--';
}

function addNoteToLog(noteInfo) {
    const logContainer = document.getElementById('analysisLog');
    
    // Supprimer le message "Aucune analyse"
    if (logContainer.querySelector('.text-gray-400')) {
        logContainer.innerHTML = '';
    }
    
    const timestamp = new Date().toLocaleTimeString('fr-FR');
    const logEntry = document.createElement('div');
    logEntry.style.cssText = 'padding: 0.5rem; border-bottom: 1px solid #e5e7eb; font-size: 0.875rem;';
    logEntry.innerHTML = `
        <strong>${timestamp}</strong> - Note: <strong>${noteInfo.note || '--'}</strong> 
        (${noteInfo.frequency ? noteInfo.frequency.toFixed(1) : '--'} Hz, ${typeof noteInfo.cents === 'number' ? (noteInfo.cents > 0 ? '+' : '') + Math.round(noteInfo.cents) : '--'} cents)
    `;
    
    logContainer.insertBefore(logEntry, logContainer.firstChild);
    
    // Garder seulement les 10 dernières entrées
    while (logContainer.children.length > 10) {
        logContainer.removeChild(logContainer.lastChild);
    }
}

function showNotification(message, type = 'info') {
    const notification = document.getElementById('notification');
    notification.textContent = message;
    notification.classList.add('show');
    
    setTimeout(() => {
        notification.classList.remove('show');
    }, 3000);
}

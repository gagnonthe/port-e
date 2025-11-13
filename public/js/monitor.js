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
let filterHighpass, filterLowpass, filterNotch50; // anti-bruit/parasites
let freqHistory = []; // lissage médian
const FREQ_HISTORY_SIZE = 5;

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    initSocket();
    setupEventListeners();
    initVisualizer();
    initA4Controls();
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

function initA4Controls() {
    const a4El = document.getElementById('a4Value');
    const down = document.getElementById('a4Down');
    const up = document.getElementById('a4Up');
    if (!a4El || !down || !up) return;
    const render = () => { a4El.textContent = getA4Freq().toString(); };
    render();
    down.addEventListener('click', () => {
        const cur = getA4Freq();
        const next = Math.max(400, Math.min(480, Math.round(cur - 1)));
        localStorage.setItem('A4_TUNING', String(next));
        render();
    });
    up.addEventListener('click', () => {
        const cur = getA4Freq();
        const next = Math.max(400, Math.min(480, Math.round(cur + 1)));
        localStorage.setItem('A4_TUNING', String(next));
        render();
    });
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
                echoCancellation: false,
                noiseSuppression: false,
                autoGainControl: false,
                channelCount: 1
            } 
        });
        
        // Créer le contexte audio
        // Laisse le navigateur choisir le meilleur sample rate (évite certains appareils muets)
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        analyser = audioContext.createAnalyser();
        microphone = audioContext.createMediaStreamSource(stream);

        // Chaîne de filtres pour limiter les parasites (meilleure précision)
        filterHighpass = audioContext.createBiquadFilter();
        filterHighpass.type = 'highpass';
        filterHighpass.frequency.value = 20; // enlever DC & infra

        filterNotch50 = audioContext.createBiquadFilter();
        filterNotch50.type = 'notch';
        filterNotch50.frequency.value = 50; // 50Hz secteur FR
        filterNotch50.Q.value = 30;

        filterLowpass = audioContext.createBiquadFilter();
        filterLowpass.type = 'lowpass';
        filterLowpass.frequency.value = 5000; // au-delà peu utile pour pitch piano

        analyser.fftSize = 4096; // plus de points -> meilleure YIN
        const bufferLength = analyser.frequencyBinCount;
        dataArray = new Uint8Array(bufferLength);

        // Connecter: mic -> highpass -> notch50 -> lowpass -> analyser
        microphone.connect(filterHighpass);
        filterHighpass.connect(filterNotch50);
        filterNotch50.connect(filterLowpass);
        filterLowpass.connect(analyser);
        
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
        let result = detectPitchYIN(timeDomainBuffer, audioContext.sampleRate);
        let freq = result && result.freq;
        let prob = result && result.probability;

        // Fallback: si YIN ne trouve rien, essaie autocorrélation
        if ((!freq || !isFinite(freq)) && audioContext) {
            const ac = detectPitchAutocorr(timeDomainBuffer, audioContext.sampleRate);
            if (ac && ac.freq) {
                freq = ac.freq; prob = Math.max(prob || 0, ac.probability || 0.6);
            }
        }

        // Seuils de qualité (un peu assouplis) pour éviter les fausses notes
        if (freq && isFinite(freq) && freq > 20 && freq < 5000 && (prob || 0) >= 0.7) {
            // Lissage par médiane des N dernières fréquences
            freqHistory.push(freq);
            if (freqHistory.length > FREQ_HISTORY_SIZE) freqHistory.shift();
            const smoothFreq = median(freqHistory);

            const noteInfo = frequencyToNote(smoothFreq);
            // Envoyer au serveur: note en temps réel
            socket.emit('note-data', noteInfo);

            // Mettre à jour l'UI locale (note)
            updateNoteLocal(noteInfo);
            addNoteToLog(noteInfo);
        }
    }, 150);
}

// Détection de pitch via YIN (plus robuste que l'autocorrélation simple)
function detectPitchYIN(timeDomain, sampleRate) {
    const bufferSize = timeDomain.length;
    const yinBuffer = new Float32Array(bufferSize / 2);

    // Étape 1: différence cumulée
    for (let tau = 1; tau < yinBuffer.length; tau++) {
        let sum = 0;
        for (let i = 0; i < yinBuffer.length; i++) {
            const delta = timeDomain[i] - timeDomain[i + tau];
            sum += delta * delta;
        }
        yinBuffer[tau] = sum;
    }
    yinBuffer[0] = 1;

    // Étape 2: normalisation cumulée
    let runningSum = 0;
    for (let tau = 1; tau < yinBuffer.length; tau++) {
        runningSum += yinBuffer[tau];
        yinBuffer[tau] = yinBuffer[tau] * tau / runningSum;
    }

    // Étape 3: seuil
    const threshold = 0.15; // légèrement plus permissif
    let tauEstimate = -1;
    for (let tau = 2; tau < yinBuffer.length; tau++) {
        if (yinBuffer[tau] < threshold) {
            while (tau + 1 < yinBuffer.length && yinBuffer[tau + 1] < yinBuffer[tau]) {
                tau++;
            }
            tauEstimate = tau;
            break;
        }
    }
    if (tauEstimate === -1) {
        return { freq: null, probability: 0 };
    }

    // Étape 4: interpolation parabolique
    const x0 = yinBuffer[tauEstimate - 1];
    const x1 = yinBuffer[tauEstimate];
    const x2 = yinBuffer[tauEstimate + 1];
    const betterTau = tauEstimate + (x2 - x0) / (2 * (2 * x1 - x2 - x0));

    const freq = sampleRate / betterTau;
    const probability = 1 - x1; // confiance approximative
    // Filtre RMS pour éviter le silence
    let rms = 0;
    for (let i = 0; i < bufferSize; i++) rms += timeDomain[i] * timeDomain[i];
    rms = Math.sqrt(rms / bufferSize);
    if (rms < 0.005) return { freq: null, probability: 0 };

    return { freq, probability };
}

// Fallback: autocorrélation simple (probabilité moyenne)
function detectPitchAutocorr(buffer, sampleRate) {
    let size = buffer.length;
    // Gate RMS
    let rms = 0; for (let i = 0; i < size; i++) rms += buffer[i] * buffer[i];
    rms = Math.sqrt(rms / size);
    if (rms < 0.005) return { freq: null, probability: 0 };

    const autocorr = new Float32Array(size);
    for (let lag = 0; lag < size; lag++) {
        let sum = 0;
        for (let i = 0; i < size - lag; i++) sum += buffer[i] * buffer[i + lag];
        autocorr[lag] = sum;
    }
    let d = 0; while (d < size - 1 && autocorr[d] > autocorr[d + 1]) d++;
    let maxPos = d, maxVal = -Infinity;
    for (let i = d; i < size; i++) {
        if (autocorr[i] > maxVal) { maxVal = autocorr[i]; maxPos = i; }
    }
    if (!isFinite(maxPos) || maxPos <= 1) return { freq: null, probability: 0 };
    const x0 = autocorr[maxPos - 1] || 0, x1 = autocorr[maxPos], x2 = autocorr[maxPos + 1] || 0;
    const shift = (x2 - x0) / (2 * (2 * x1 - x2 - x0));
    const period = maxPos + shift;
    const freq = sampleRate / period;
    if (!isFinite(freq)) return { freq: null, probability: 0 };
    return { freq, probability: 0.6 };
}

function frequencyToNote(frequency) {
    const A4 = getA4Freq();
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

function getA4Freq() {
    const v = Number(localStorage.getItem('A4_TUNING'));
    if (v && isFinite(v) && v > 400 && v < 480) return v;
    return 440;
}

function median(arr) {
    const a = [...arr].sort((x, y) => x - y);
    const mid = Math.floor(a.length / 2);
    return a.length % 2 ? a[mid] : (a[mid - 1] + a[mid]) / 2;
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

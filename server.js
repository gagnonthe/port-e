const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

const PORT = process.env.PORT || 3000;

// Servir les fichiers statiques
app.use(express.static(path.join(__dirname, 'public')));

// Routes
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/monitor', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'monitor.html'));
});

// Health check pour Render
app.get('/health', (req, res) => {
    res.status(200).json({ status: 'ok', uptime: process.uptime() });
});

// Gestion des connexions WebSocket
let connectedDevices = new Map();
let currentScore = null;
let audioAnalysis = null;

io.on('connection', (socket) => {
    console.log('Nouvel appareil connecté:', socket.id);

    // Identifier le type d'appareil
    socket.on('register-device', (data) => {
        const deviceInfo = {
            id: socket.id,
            type: data.type, // 'dashboard' ou 'monitor'
            name: data.name || 'Appareil inconnu',
            connectedAt: new Date()
        };
        
        connectedDevices.set(socket.id, deviceInfo);
        
        // Notifier tous les dashboards de la nouvelle connexion
        io.emit('devices-update', Array.from(connectedDevices.values()));
        
        console.log(`Appareil enregistré: ${deviceInfo.type} - ${deviceInfo.name}`);
        
        // Si c'est un dashboard qui se connecte, envoyer le score actuel
        if (data.type === 'dashboard' && currentScore !== null) {
            socket.emit('score-update', {
                score: currentScore,
                analysis: audioAnalysis,
                timestamp: new Date()
            });
        }
    });

    // Recevoir les données audio du moniteur
    socket.on('audio-data', (data) => {
        console.log('Données audio reçues:', data);
        currentScore = data.score;
        audioAnalysis = data.analysis;
        
        // Transmettre aux dashboards
        io.emit('score-update', {
            score: data.score,
            analysis: data.analysis,
            timestamp: new Date()
        });
    });

    // Commande de démarrage/arrêt depuis le dashboard
    socket.on('control-monitoring', (command) => {
        // Transmettre aux moniteurs
        connectedDevices.forEach((device, id) => {
            if (device.type === 'monitor') {
                io.to(id).emit('monitoring-control', command);
            }
        });
    });

    // Déconnexion
    socket.on('disconnect', () => {
        console.log('Appareil déconnecté:', socket.id);
        connectedDevices.delete(socket.id);
        io.emit('devices-update', Array.from(connectedDevices.values()));
    });
});

server.listen(PORT, () => {
    console.log(`\n🚀 Serveur démarré sur http://localhost:${PORT}`);
    console.log(`📱 Dashboard: http://localhost:${PORT}`);
    console.log(`🎤 Moniteur: http://localhost:${PORT}/monitor\n`);
});

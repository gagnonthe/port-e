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

// Exposer une config côté client (permet de forcer une URL serveur publique si besoin)
app.get('/config.js', (req, res) => {
    const config = {
        // PUBLIC_SERVER_URL peut être défini dans Render (ou autre) pour forcer les clients à se connecter à une URL donnée
        SERVER_URL: process.env.PUBLIC_SERVER_URL || ''
    };
    res.type('application/javascript').send(`window.PORTER_CONFIG = ${JSON.stringify(config)};`);
});

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
let currentNote = null; // { note, frequency, cents, timestamp }

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
        
        // Si c'est un dashboard qui se connecte, envoyer la note actuelle
        if (data.type === 'dashboard' && currentNote !== null) {
            socket.emit('note-update', currentNote);
        }
    });

    // Recevoir les notes détectées depuis le moniteur
    socket.on('note-data', (data) => {
        // data: { note, frequency, cents }
        console.log('Note détectée:', data);
        currentNote = {
            note: data.note || null,
            frequency: data.frequency || null,
            cents: data.cents || 0,
            timestamp: new Date()
        };

        // Diffuser aux dashboards
        io.emit('note-update', currentNote);
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

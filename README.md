Application Progressive Web App (PWA) de surveillance audio avec détection de notes musicales en temps réel (portier intelligent).

## 🎯 Fonctionnalités

- **Dashboard (Portier)** : Affiche la note musicale détectée en temps réel (ex: A4, C#3), la fréquence et l'écart en cents
- **Moniteur Audio** : Capture et analyse l'audio, détecte la hauteur (pitch) et calcule la note en temps réel
- **Communication en temps réel** : WebSocket pour la synchronisation entre appareils
- **PWA** : Installation possible sur mobile et desktop
- **Analyse audio** : Détection de hauteur (pitch) par autocorrélation, mappage en notes musicales

## 📱 Structure

```
portee/
├── public/
│   ├── index.html          # Dashboard (affichage des notes)
│   ├── monitor.html        # Moniteur audio (détection des notes)
│   ├── manifest.json       # Configuration PWA
│   ├── sw.js              # Service Worker
│   ├── js/
│   │   ├── dashboard.js   # Logique dashboard
│   │   ├── monitor.js     # Logique moniteur
│   │   └── sw-register.js # Enregistrement SW
│   └── icons/             # Icônes PWA
├── server.js              # Serveur Node.js + Socket.IO (+ /config.js côté client)
└── package.json
```

## 🚀 Installation

1. Installer les dépendances :
```bash
npm install
```

2. Démarrer le serveur :
```bash
npm start
```

3. Accéder aux pages :
   - Dashboard : http://localhost:3000
   - Moniteur : http://localhost:3000/monitor

Le dashboard affiche la note détectée (ex: A4), la fréquence (Hz) et l'écart en cents.

## 💡 Utilisation

### Dashboard (Appareil principal)
1. Ouvrir http://localhost:3000
2. Scanner le QR code ou copier le lien du moniteur
3. Consulter le score environnemental en temps réel

### Moniteur (Appareil secondaire)
1. Ouvrir le lien du moniteur depuis le QR code
2. Autoriser l'accès au microphone
3. Cliquer sur le bouton pour démarrer l'analyse
4. Le score sera envoyé au dashboard automatiquement

## 🔧 Technologies

- **Frontend** : HTML5, CSS3, JavaScript (Vanilla)
- **Backend** : Node.js, Express
- **WebSocket** : Socket.IO
- **Audio** : Web Audio API
- **PWA** : Service Worker, Web App Manifest
- **QR Code** : QRCode.js

## 🎵 Détection de note (pitch)

La détection de note utilise une autocorrélation simple sur le signal temporel pour estimer la fréquence fondamentale, puis convertit la fréquence en note MIDI (base A4=440Hz) et calcule l'écart en cents.

Affichage :
- Note (ex: C4, A#3)
- Fréquence (Hz)
- Écart en cents (positif = au-dessus de la note, négatif = en-dessous)

## 🌐 Déploiement

### Déploiement sur Render (recommandé)

1) Poussez votre code sur GitHub (si ce n'est pas déjà fait)
```bash
git remote add origin https://github.com/<votre-compte>/<votre-repo>.git
git add .
git commit -m "Initial commit Portée PWA"
git push -u origin main
```

2) Sur https://render.com
- Créez un nouveau "Web Service" à partir de votre repo
- Type: Web Service
- Runtime: Node
- Build Command: `npm install`
- Start Command: `node server.js`
- Health Check Path: `/health`
- Auto Deploy: On

4) (Optionnel) Forcer l'URL serveur côté client

Le serveur expose `/config.js` qui injecte `window.PORTER_CONFIG`. Sur Render, définissez la variable d'environnement `PUBLIC_SERVER_URL` (ex: `https://portee.onrender.com`). Les clients utiliseront cette URL pour le socket et pour le lien/QR du moniteur. Sans cette variable, l'origine de la page est utilisée.

3) Option (Infra as Code): Render lira `render.yaml` automatiquement si vous l'activez

Une fois déployé, ouvrez l'URL Render et testez:
- Page Dashboard: `/`
- Page Moniteur: `/monitor`

WebSockets (Socket.IO) sont supportés sur Render; assurez-vous d'utiliser un Web Service (pas un Static Site).

## 📝 License

ISC

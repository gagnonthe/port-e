# Portier Audio - PWA

Application Progressive Web App (PWA) de surveillance audio avec système de portier intelligent.

## 🎯 Fonctionnalités

- **Dashboard (Portier)** : Page principale affichant le score environnemental en temps réel
- **Moniteur Audio** : Page de capture et analyse audio de l'environnement
- **Communication en temps réel** : WebSocket pour la synchronisation entre appareils
- **PWA** : Installation possible sur mobile et desktop
- **Analyse audio** : Détection du volume, bruit et fréquences

## 📱 Structure

```
portee/
├── public/
│   ├── index.html          # Dashboard (Portier)
│   ├── monitor.html        # Moniteur audio
│   ├── manifest.json       # Configuration PWA
│   ├── sw.js              # Service Worker
│   ├── js/
│   │   ├── dashboard.js   # Logique dashboard
│   │   ├── monitor.js     # Logique moniteur
│   │   └── sw-register.js # Enregistrement SW
│   └── icons/             # Icônes PWA
├── server.js              # Serveur Node.js + Socket.IO
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

## 📊 Calcul du Score

Le score environnemental (0-100) est calculé selon :
- Volume audio (décibels)
- Niveau de bruit (variabilité)
- Plage de fréquences dominante

Score :
- 80-100 : Excellent ✅
- 60-79 : Bon 👍
- 40-59 : Moyen ⚠️
- 0-39 : Faible ❌

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

3) Option (Infra as Code): Render lira `render.yaml` automatiquement si vous l'activez

Une fois déployé, ouvrez l'URL Render et testez:
- Page Dashboard: `/`
- Page Moniteur: `/monitor`

WebSockets (Socket.IO) sont supportés sur Render; assurez-vous d'utiliser un Web Service (pas un Static Site).

## 📝 License

ISC

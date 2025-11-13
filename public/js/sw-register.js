// Service Worker registration
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js')
            .then(registration => {
                console.log('Service Worker enregistré:', registration.scope);
            })
            .catch(error => {
                console.log('Erreur Service Worker:', error);
            });
    });
}

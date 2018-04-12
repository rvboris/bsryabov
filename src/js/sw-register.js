/* eslint-env browser */

if ('serviceWorker' in navigator && window.env === 'production') {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').then(() => {}).catch();
  });
}

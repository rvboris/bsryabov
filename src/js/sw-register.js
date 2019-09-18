/* eslint-env browser */

if ('serviceWorker' in navigator && window.env === 'production') {
  window.addEventListener('load', () => {
    // eslint-disable-next-line no-console
    navigator.serviceWorker.register('sw.js').then(() => {}).catch(console.log);
  });
}

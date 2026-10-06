(() => {
  const params = new URLSearchParams(location.search);
  const offline = location.protocol === 'file:' || params.get('desktop') === '1' || params.get('portable') === '1';
  if (!offline) return;

  document.documentElement.classList.add('offline-files');
  document.querySelectorAll('[data-app-download]').forEach(el => el.classList.add('hidden'));
})();

(() => {
  const params = new URLSearchParams(location.search);
  const isOfflinePackage =
    document.documentElement.dataset.package === 'offline' ||
    params.get('desktop') === '1' ||
    params.get('portable') === '1';

  // Important: a GitHub-ready build opened locally via file:// is still a normal
  // distributable build and should continue to show Download App.
  if (!isOfflinePackage) return;

  document.documentElement.classList.add('offline-files');
  document.querySelectorAll('[data-app-download]').forEach((el) => el.classList.add('hidden'));
})();

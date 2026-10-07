(() => {
  const params = new URLSearchParams(location.search);
  const isOfflinePackage =
    document.documentElement.dataset.package === 'offline' ||
    params.get('desktop') === '1' ||
    params.get('portable') === '1';

  // A local/offline copy still loads the sync UI, but starts in Standalone and
  // makes no internet connection unless Remote is explicitly selected.
  if (isOfflinePackage) {
    document.documentElement.classList.add('offline-files');
    document.querySelectorAll('[data-app-download]').forEach((el) => el.classList.add('hidden'));
  }

  if (!document.querySelector('script[data-av-cloud-sync]')) {
    const script = document.createElement('script');
    script.src = 'js/cloud-sync.js';
    script.dataset.avCloudSync = '';
    document.body.appendChild(script);
  }
})();

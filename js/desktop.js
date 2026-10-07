(() => {
  const params = new URLSearchParams(location.search);
  const isOfflinePackage =
    document.documentElement.dataset.package === 'offline' ||
    params.get('desktop') === '1' ||
    params.get('portable') === '1';

  // Important: a GitHub-ready build opened locally via file:// is still a normal
  // distributable build and should continue to show Download App unless it has
  // explicitly been marked as the offline/portable package.
  if (isOfflinePackage) {
    document.documentElement.classList.add('offline-files');
    document.querySelectorAll('[data-app-download]').forEach((el) => el.classList.add('hidden'));
  }

  // Load network sync after the normal timer/operator code has initialised.
  // The module defaults to Standalone, so it adds no internet dependency to the
  // portable/offline build. Remote mode only connects when the user asks it to.
  if (!document.querySelector('script[data-av-cloud-sync]')) {
    const script = document.createElement('script');
    script.src = 'js/cloud-sync.js';
    script.dataset.avCloudSync = '';
    document.body.appendChild(script);
  }
})();

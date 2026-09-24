// Match Checker's system/light/dark preference without sharing its saved setting.
(() => {
  const key = 'uma-factor-stitcher:theme:v1';
  const system = window.matchMedia('(prefers-color-scheme: dark)');
  const select = document.querySelector('#theme-select');
  let preference = 'system';
  try { preference = localStorage.getItem(key) || 'system'; } catch {}
  if (!['system', 'light', 'dark'].includes(preference)) preference = 'system';
  const apply = () => {
    document.documentElement.dataset.theme = preference === 'system' ? (system.matches ? 'dark' : 'light') : preference;
    document.documentElement.dataset.themePreference = preference;
  };
  select.value = preference;
  select.addEventListener('change', () => {
    preference = select.value;
    apply();
    try { localStorage.setItem(key, preference); } catch {}
  });
  system.addEventListener('change', apply);
  apply();
})();

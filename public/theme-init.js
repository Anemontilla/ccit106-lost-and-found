(function () {
  'use strict';

  var theme = 'dark';
  try {
    var stored = window.localStorage.getItem('cspc-theme') ||
      window.localStorage.getItem('lost-found-theme');
    if (stored === 'light' || stored === 'dark') {
      theme = stored;
    } else if (window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches) {
      theme = 'light';
    }
  } catch (error) {
    // Theme selection is optional when browser storage is unavailable.
  }

  document.documentElement.setAttribute('data-theme', theme);
  var themeColor = document.querySelector('meta[name="theme-color"]');
  if (themeColor) themeColor.setAttribute('content', theme === 'light' ? '#e8eefb' : '#030d2e');
})();

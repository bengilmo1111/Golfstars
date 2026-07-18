(function (global) {
  'use strict';
  const cache = {};
  const status = {}; // key -> 'loading' | 'ready' | 'error'

  function load(key, url) {
    if (status[key] === 'loading' || status[key] === 'ready') return;
    status[key] = 'loading';
    const img = new Image();
    img.decoding = 'async';
    img.onload = function () { status[key] = 'ready'; };
    img.onerror = function () { status[key] = 'error'; }; // silent: game falls back
    img.src = url;
    cache[key] = img;
  }
  function get(key) { return status[key] === 'ready' ? cache[key] : null; }
  function preloadLevels(levels) {
    levels.forEach(function (lvl) { load('bg-' + lvl.id, 'assets/bg-' + lvl.id + '.webp'); });
  }

  const api = { load, get, preloadLevels, status };
  global.GS = global.GS || {};
  global.GS.Images = api;
})(typeof window !== 'undefined' ? window : globalThis);

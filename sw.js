// 百词斩 KET 词汇 - Service Worker (离线缓存)
const CACHE_NAME = 'ket-vocab-v7';
const ASSETS = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './words.js',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './icon-180.png',
  './icon-167.png',
  './icon-152.png',
  './icon-120.png'
];

// 安装：预缓存所有资源
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(ASSETS);
    }).then(() => self.skipWaiting())
  );
});

// 激活：清理旧缓存
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(
        keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))
      );
    }).then(() => self.clients.claim())
  );
});

// 请求拦截：缓存优先，网络回退
self.addEventListener('fetch', event => {
  // 只处理 GET 请求
  if (event.request.method !== 'GET') return;

  event.respondWith(
    caches.match(event.request).then(cached => {
      // 缓存命中：返回缓存
      if (cached) return cached;
      // 未命中：尝试网络请求
      return fetch(event.request).then(response => {
        // 请求成功，缓存副本（同源请求才缓存）
        if (response && response.status === 200 && response.type === 'basic') {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        }
        return response;
      }).catch(() => {
        // 网络失败，返回首页缓存作为兜底
        return caches.match('./index.html');
      });
    })
  );
});

/* 应用外壳缓存：安装后离线也能打开。改动任何文件后请把版本号 +1，
   已安装的用户下次打开时会自动拿到新版本。 */
var CACHE_NAME = "calorie-app-v2";
var SHELL = [
  "./",
  "index.html",
  "style.css",
  "app.js",
  "manifest.json",
  "icons/icon-192.png",
  "icons/icon-512.png",
  "icons/apple-touch-icon.png"
];

self.addEventListener("install", function (e) {
  e.waitUntil(
    caches.open(CACHE_NAME).then(function (cache) {
      return cache.addAll(SHELL);
    }).then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener("activate", function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (k) {
        if (k !== CACHE_NAME) return caches.delete(k);
      }));
    }).then(function () { return self.clients.claim(); })
  );
});

/* 网络优先、离线回退缓存：在线时总是拿最新文件（顺便刷新缓存），
   断网时用缓存里的版本 */
self.addEventListener("fetch", function (e) {
  if (e.request.method !== "GET") return;
  // 不拦截外部 API 请求（如 CNF 营养数据库），只缓存本站文件
  if (new URL(e.request.url).origin !== self.location.origin) return;
  e.respondWith(
    fetch(e.request).then(function (resp) {
      if (resp && resp.ok) {
        var copy = resp.clone();
        caches.open(CACHE_NAME).then(function (cache) { cache.put(e.request, copy); });
      }
      return resp;
    }).catch(function () {
      return caches.match(e.request, { ignoreSearch: true }).then(function (cached) {
        return cached || caches.match("index.html");
      });
    })
  );
});

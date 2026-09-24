/* 홈트 앱 서비스 워커 — 홈 화면 설치와 빠른 재실행을 위한 캐시 */
const VERSION = 'homefit-v6';

/* 이 파일들은 하나라도 못 받으면 설치를 실패로 처리 — 반쪽짜리 캐시로 갈아타지 않도록 */
const SHELL = [
  './',
  './index.html',
  './tracker.html',
  './routine.html',
  './moves.html',
  './stretch.html',
  './diet.html'
];
/* 있으면 좋지만 없어도 앱은 도는 것들 */
const EXTRA = [
  './manifest.webmanifest',
  './icon-192.png',
  './icon-512.png',
  './icon-maskable-512.png',
  './apple-touch-icon.png'
];

const NET_TIMEOUT = 2500;   /* 이 시간 안에 응답이 없으면 캐시부터 보여줌 */

/* HTTP 캐시를 건너뛰고 항상 새 파일을 받음 — 새 버전에 옛 파일이 섞여 들어가던 문제 */
function fresh(url) {
  return new Request(url, { cache: 'reload' });
}

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(VERSION).then(c =>
      Promise.all(SHELL.map(a => c.add(fresh(a))))            // 하나라도 실패하면 설치 실패
        .then(() => Promise.allSettled(EXTRA.map(a => c.add(fresh(a)))))
        .then(() => self.skipWaiting())
    )
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

function fromCache(req) {
  return caches.match(req).then(r => {
    if (r) return r;
    return req.mode === 'navigate' ? caches.match('./index.html') : undefined;
  });
}

/* 네트워크 우선이되, 2.5초 안에 답이 없으면 캐시를 먼저 보여줌.
   신호가 약한 곳에서 검은 화면으로 30초 넘게 멈춰 있던 문제를 막습니다. */
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;

  const net = fetch(req).then(res => {
    if (res && res.ok) {
      const copy = res.clone();
      caches.open(VERSION).then(c => c.put(req, copy)).catch(() => {});
    }
    return res;
  });

  const slow = new Promise(resolve => {
    setTimeout(() => resolve(fromCache(req).then(r => r || net)), NET_TIMEOUT);
  });

  e.respondWith(
    Promise.race([net, slow])
      .catch(() => fromCache(req))
      .then(r => r || net.catch(() => fromCache(req)))
  );
});

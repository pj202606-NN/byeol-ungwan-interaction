// ---------- 태블릿 인트로 영상 (#3 → #4 → #5) ----------
// videos/intro-transition-tablet.mp4 (62.5초, 854×480)는 Unity 영상 02의 21.5초 ~ 84초 구간(우주 → 연기 → 별운관 대문 → 실내)에
// 맞춰 만든 태블릿 전용 영상이다. 두 영상의 밝기 변화·검은 화면 위치를 맞대어 보면 '태블릿 시각 = 02 시각 - 21.5초'로 일치한다.
// Unity 영상 02가 TIMELINE.page3.introVideoAt(21.5초)에 이르면 음소거·1회 재생하고, 그 뒤로도 02의 재생 위치에 맞춰 둔다.
// #3 → #4 → #5는 이 영상이 끊기지 않도록 같은 문서에서 화면만 갈아 끼우고(goToInPlace), 영상 요소 하나를 새 화면 맨 위로 옮긴다.
// #5에서 책상이 드러나는 순간(TIMELINE.page5.deskAt, 02의 77초)에 걷어 낸다 — 영상은 02의 84초까지라 마지막 약 7초는 쓰지 않는다.
// 스타일은 oracle.css의 .intro-video.
var IntroVideo = (function () {
  var SRC = 'videos/intro-transition-tablet.mp4';
  var DRIFT = 0.5;          // Unity 02 위치와 이만큼(초) 넘게 벌어지면 맞춘다
  var video = null;
  var state = 'idle';       // idle → waiting → playing → done (또는 failed)
  var clockRef = null, startAt = 0, syncTimer = null;

  function create() {
    var v = document.createElement('video');
    v.className = 'intro-video';
    v.src = SRC;
    v.muted = true;
    v.loop = false;
    v.playsInline = true;
    v.preload = 'auto';
    ['muted', 'playsinline', 'disablepictureinpicture', 'disableremoteplayback'].forEach(function (a) { v.setAttribute(a, ''); });
    v.addEventListener('error', function () {
      if (state === 'done') return;
      state = 'failed';
      console.error('[인트로 영상] 불러오지 못함 → 기존 #3·#4 화면으로 진행:', v.error && v.error.message);
    });
    window.addEventListener('pagehide', function () { v.pause(); });
    return v;
  }

  // Unity 02 기준으로 태블릿 영상이 지금 있어야 할 위치(초). 모르면 null
  function expected() {
    var now = clockRef ? clockRef.now(2) : null;
    return now == null ? null : (now - startAt) / 1000;
  }
  function resync() {
    if (state !== 'playing') return;
    var e = expected();
    if (e == null || !(video.duration > 0) || e >= video.duration) return;
    if (Math.abs(video.currentTime - e) > DRIFT) video.currentTime = Math.max(0, e);
  }
  function begin() {
    if (state !== 'waiting') return;
    var e = expected();
    var seekTo = function () { if (e != null && e > 0) video.currentTime = e; };
    if (video.readyState >= 1) seekTo(); else video.addEventListener('loadedmetadata', seekTo, { once: true });
    var p = video.play();
    (p && p.then ? p : Promise.resolve()).then(function () {
      if (state !== 'waiting') { video.pause(); return; }
      state = 'playing';
      video.classList.add('ready');
      syncTimer = setInterval(resync, 2000);
      console.info('[인트로 영상] 재생 시작 · 태블릿 영상 ' + video.currentTime.toFixed(1) + '초 (Unity 02 ' + ((startAt / 1000) + video.currentTime).toFixed(1) + '초)');
    }).catch(function (err) {
      if (state !== 'waiting') return;
      state = 'failed';
      console.error('[인트로 영상] 재생하지 못함 → 기존 #3·#4 화면으로 진행', err);
    });
  }

  return {
    // 지금 장면의 화면 맨 위 층에 영상을 둔다 (#3·#4·#5 스크립트 첫머리에서 부른다. 아직 없으면 만들어 미리 받아 둔다)
    attach: function () {
      var screen = document.getElementById('screen');
      if (!screen || state === 'done') return;
      if (!video) video = create();
      screen.appendChild(video);   // 같은 작업 안에서 옮기므로 재생이 멈추지 않는다
    },
    // clock(영상 02 시계)의 at(ms)에 재생을 시작한다
    start: function (clock, at) {
      if (!video || state !== 'idle') return;
      clockRef = clock;
      startAt = at;
      state = 'waiting';
      clock.at(2, at).then(begin);
    },
    // 영상이 화면을 덮고 있는 동안은 #3 → #4 → #5를 같은 문서에서 이어 간다 (영상이 없으면 예전처럼 페이지를 새로 연다)
    covering: function () { return state === 'waiting' || state === 'playing'; },
    // ms 동안 서서히 걷어 내고 멈춘 뒤 비운다 (#5 책상 등장)
    finish: function (ms) {
      if (!video || state === 'done') return;
      var wasPlaying = state === 'playing';
      state = 'done';
      clearInterval(syncTimer);
      var v = video;
      video = null;
      v.style.transitionDuration = (ms || 0) + 'ms';
      v.classList.remove('ready');
      setTimeout(function () {
        v.pause();
        v.removeAttribute('src');
        v.load();
        v.remove();
      }, (ms || 0) + 50);
      if (wasPlaying) console.info('[인트로 영상] 책상 등장과 함께 걷어 냄');
    },
  };
})();

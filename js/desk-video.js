// ---------- 책상 배경 영상 (#2~#10) ----------
// (2026-11-19) 문을 누른 뒤 #2부터 깔린다. #2~#5는 같은 문서에서 이어 붙이고, 그 위의 검은 막을 dawn()으로 아주 천천히 걷는다.
// videos/fortune-desk-loop.mp4 (1920×1080, 약 12초)를 자동 재생·무한 반복·음소거로 책상 배경 이미지 자리에 깐다.
// #5~#10은 같은 문서에서 화면만 갈아 끼우므로(js/nav.js goToInPlace) 영상 요소 하나를 만들어 두고,
// 장면이 바뀔 때마다 새 화면(#screen)의 맨 아래 층으로 옮겨 재생을 끊지 않고 이어 간다 (다시 불러오거나 처음부터 재생하지 않음).
// 영상이 재생되기 전에는 투명해서 아래의 기존 책상 이미지(.bg-desk)가 보인다. 스타일은 oracle.css의 .desk-video.
// #11로 넘어가면 화면과 함께 빠져 멈추고, #11부터는 예전처럼 책상 이미지만 쓴다.
var DeskVideo = (function () {
  var SRC = 'videos/fortune-desk-loop.mp4';
  var video = null;

  function create() {
    var v = document.createElement('video');
    v.className = 'desk-video';
    v.src = SRC;
    v.muted = true;
    v.loop = true;
    v.autoplay = true;
    v.playsInline = true;
    v.preload = 'auto';
    ['muted', 'loop', 'autoplay', 'playsinline', 'disablepictureinpicture', 'disableremoteplayback'].forEach(function (a) { v.setAttribute(a, ''); });
    v.addEventListener('playing', function () { v.classList.add('ready'); });
    v.addEventListener('error', function () {
      console.error('[책상 영상] 불러오지 못함 → 책상 이미지로 진행:', v.error && v.error.message);
    });
    window.addEventListener('pagehide', function () { v.pause(); });
    return v;
  }

  function play() {
    var p = video.play();
    if (p && p.catch) p.catch(function (err) {
      // 자동 재생이 막히면 책상 이미지가 보이는 채로 두고, 처음 화면을 건드릴 때 다시 시도한다
      console.warn('[책상 영상] 자동 재생 실패 → 첫 터치 때 다시 시도', err);
      document.addEventListener('pointerdown', function () { video.play().catch(function () {}); }, { once: true });
    });
  }

  return {
    // 지금 장면의 화면 맨 아래 층에 책상 영상을 둔다 (#5~#10 각 장면의 스크립트 첫머리에서 부른다)
    attach: function () {
      var screen = document.getElementById('screen');
      if (!screen) return;
      if (!video) video = create();
      video.classList.remove('desk-hidden');
      // 같은 작업 안에서 옮기므로 재생이 멈추지 않는다
      screen.insertBefore(video, screen.firstChild);
      play();
    },
    // 잠시 영상을 걷어 내고 책상 이미지를 보인다 (#6 종이가 내려오는 동안). ms: 사라지는/나타나는 시간
    hide: function (ms) {
      if (!video) return;
      video.style.transitionDuration = (ms || 0) + 'ms';
      video.classList.add('desk-hidden');
    },
    show: function (ms) {
      if (!video) return;
      video.style.transitionDuration = (ms || 0) + 'ms';
      video.classList.remove('desk-hidden');
    },
    // #2~#5: 책상 위의 검은 막(shade)을 영상 02의 재생 시각에 맞춰 걷는다 (TIMELINE.dawn).
    // 막의 불투명도를 시각에서 바로 계산하므로, 장면이 바뀌어도(같은 문서에서 이어 붙임) 밝기가 끊기지 않고 이어진다.
    // 돌려주는 함수를 부르면 멈춘다 (#5에서 책상이 드러날 때). 화면이 빠지면 스스로 멈춘다.
    dawn: function (shade, clock) {
      var D = TIMELINE.dawn;
      if (!shade || !D) return function () {};
      shade.style.transition = 'none';
      var stopped = false;
      function level() {
        var t = clock.now(2);   // 영상 02의 지금 재생 위치(ms). Unity가 아직 02를 시작하지 않았으면 null
        var p = t == null || t < 0 ? 0 : Math.min(1, t / D.endAt);
        return D.from + (D.to - D.from) * Math.pow(p, D.curve);
      }
      function step() {
        if (stopped || !shade.isConnected) return;
        shade.style.opacity = level().toFixed(4);
        requestAnimationFrame(step);
      }
      step();
      return function stop() { stopped = true; };
    },
  };
})();

// ---------- 웹 ↔ Unity 영상 동기화 ----------
// Unity(WebBridge.cs)가 0.2초마다 서버에 보고하는 재생 상태(영상 번호·재생 시각)를 GET /unity-state로 읽어,
// 영상에 맞춰야 하는 웹 연출을 그 영상의 실제 재생 시각에 맞춘다. 맞출 시각은 js/timeline.js에 모여 있다.
// Unity와 연결되지 않았을 때(웹만 테스트, 정적 배포)는 각 장면의 fallback 타이머대로 예전처럼 진행한다.
// 테스트 도구의 '← 이전'/'다음 →'으로 이동하면 동기화를 끈다 (#1에 오면 다시 켜짐).
var UnitySync = (function () {
  var POLL_MS = 200;
  var STALE_MS = 2500;      // 이 시간 넘게 새 상태가 없으면 연결 안 됨으로 본다
  var info = null;          // 마지막 /unity-state 응답
  var infoAt = 0;           // 그 응답을 받은 시각 (performance.now)
  var firstDone = false;    // 첫 응답(성공이든 실패든)을 받았는지
  var readyCallbacks = [];
  var lastState = null;
  var starts = {};          // 이번 회차에서 각 영상이 시작된 시각 추정 (performance.now 기준)
  var waiters = [];
  var generation = 0;       // goToInPlace로 장면이 바뀔 때마다 증가. 이전 장면의 대기는 버린다
  var returnHandler = null;

  function enabled() {
    try { return sessionStorage.getItem('unitySyncOff') !== '1'; } catch (e) { return true; }
  }
  function connected() {
    return enabled() && !!info && info.connected && !!info.state && info.state.video > 0 &&
      performance.now() - infoAt < STALE_MS;
  }

  function poll() {
    fetch('/unity-state', { cache: 'no-store' })
      .then(function (res) { if (!res.ok) throw new Error('HTTP ' + res.status); return res.json(); })
      .then(function (data) { info = data; infoAt = performance.now(); update(); })
      .catch(function () { info = null; })
      .then(function () {
        if (!firstDone) {
          firstDone = true;
          readyCallbacks.splice(0).forEach(function (f) { f(); });
        }
        checkAll();
        setTimeout(poll, info ? POLL_MS : 2000);
      });
  }

  function update() {
    var s = info.state;
    if (!info.connected || !s || s.video <= 0) return;
    var prev = lastState;
    lastState = s;
    var restarted = !!prev && (s.cycle !== prev.cycle || s.session !== prev.session);
    if (restarted) starts = {};
    // 영상이 시작된 시각 = 지금 - (보고된 뒤 지난 시간) - (보고 당시 재생 시각). 루프가 다시 돌면 늦은 값이 나오므로 가장 이른 값을 쓴다
    var est = infoAt - info.age - s.time * 1000;
    if (starts[s.video] == null || est < starts[s.video]) starts[s.video] = est;
    if (!enabled() || s.video !== 1) return;
    // Unity가 01로 돌아옴 (영상 23 종료, reset, Unity 재시작) → 웹도 #1로.
    // 이 문서를 처음 연 순간 이미 01이면, #1·#2(문 터치 직후) 말고는 Unity와 어긋난 상태이므로 역시 #1로
    var page = currentPageName();
    if (restarted || (!prev && page !== 'page1_door.html' && page !== 'page2_transition.html')) {
      onReturnToStart();
    }
  }

  function onReturnToStart() {
    if (currentPageName() === 'page1_door.html') return;
    console.info('[Unity sync] Unity가 처음 영상(01)으로 돌아옴 → 웹도 처음 문 화면으로');
    var handler = returnHandler;
    returnHandler = null;
    if (handler) handler();
    else returnToDoor();
  }

  function remove(w) {
    var i = waiters.indexOf(w);
    if (i >= 0) waiters.splice(i, 1);
  }
  function check(w) {
    clearTimeout(w.timer);
    if (w.gen !== generation) { remove(w); return; }
    if (!firstDone) return;                       // 첫 응답을 받으면 checkAll에서 다시 확인
    var now = performance.now();
    var due = connected() ? w.cond(now) : w.fallbackAt - now;   // true(지금) / false(다음 보고 때 다시) / 남은 ms
    if (due === true || (typeof due === 'number' && due <= 0)) {
      remove(w);
      w.resolve();
    } else if (typeof due === 'number') {
      w.timer = setTimeout(function () { check(w); }, Math.min(due, 1000));
    }
  }
  function checkAll() { waiters.slice().forEach(check); }
  function wait(cond, fallbackAt) {
    return new Promise(function (resolve) {
      var w = { gen: generation, cond: cond, fallbackAt: fallbackAt, resolve: resolve, timer: null };
      waiters.push(w);
      check(w);
    });
  }

  // 영상 v가 ms 지점에 이른 순간. 이 장면을 연 뒤에 v가 이미 지나갔다면 바로
  function atCond(v, ms) {
    return function (now) {
      if (starts[v] != null) return starts[v] + ms - now;
      return !!lastState && lastState.video > v;
    };
  }
  // 영상 v(또는 그 뒤 영상)가 재생되기 시작한 순간
  function reachCond(v) {
    return function () { return !!lastState && lastState.video >= v; };
  }

  // 장면 하나의 시계. video: 이 장면의 기준 영상, fallback: { 영상: 장면 시작 기준 그 영상의 시작 시각(ms) } (js/timeline.js)
  function clock(video, fallback) {
    var t0 = performance.now();
    function base(v) { return fallback[v] != null ? fallback[v] : 0; }
    return {
      video: video,
      // 이 장면이 시작되는 순간의 기준 영상 시각 (Unity 없이 테스트할 때의 가정값, 개발 노트용)
      sceneStart: -base(video),
      at: function (v, ms) {
        if (ms === undefined) { ms = v; v = video; }
        return wait(atCond(v, ms), t0 + base(v) + ms);
      },
      reach: function (v) { return wait(reachCond(v), t0 + base(v)); },
      // 개발 노트용: 영상 v의 ms 지점을 이 장면 기준 영상의 연속 시각으로
      noteTime: function (v, ms) { return base(v) - base(video) + ms; },
    };
  }

  poll();
  return {
    enabled: enabled,
    connected: connected,
    state: function () { return connected() ? lastState : null; },
    ready: function (fn) { if (firstDone) fn(); else readyCallbacks.push(fn); },
    clock: clock,
    // 다음 장면으로 넘어갈 때 (goToInPlace) 이전 장면의 대기와 복귀 처리기를 버린다
    nextScene: function () { generation++; returnHandler = null; },
    // Unity가 01로 돌아왔을 때 기본 동작(바로 #1) 대신 실행할 처리 (예: #22의 시야가 올라가는 연출 뒤 #1)
    onReturnToStart: function (fn) { returnHandler = fn; },
  };
})();

function currentPageName() {
  return location.pathname.split('/').pop() || 'page1_door.html';
}

// 처음 문 화면(#1)으로. 퇴장 장면(#18~#22)에서는 같은 문서에서 시야가 내려오듯(?reveal) 이어 붙인다
var returningToDoor = false;
function returnToDoor() {
  if (returningToDoor) return;
  returningToDoor = true;
  var n = Number((/^page(\d+)_/.exec(currentPageName()) || [])[1]);
  if (n >= 18) {
    goToInPlace('page1_door.html?reveal', { crossfade: 1200 }).then(function () { returningToDoor = false; });
  } else {
    location.href = 'page1_door.html';
  }
}

// 이전 관람객이 입력·선택한 값을 지운다 (#1에서)
function clearVisitData() {
  ['birth', 'constellationResult', 'fortunePeriod', 'fortuneTopic', 'fortuneResult'].forEach(function (k) {
    try { sessionStorage.removeItem(k); } catch (e) {}
  });
}

// Tablet -> local Node server -> Unity. Does not block existing UI transitions.
// 같은 명령을 2초 안에 다시 보내지 않고(중복 터치), 전송에 실패하면 3번까지 다시 시도한 뒤 콘솔에 남긴다.
// 서버에 올라간 명령은 Unity가 그 명령의 대기 루프 영상에 들어갈 때까지 들고 있다가 적용한다 (WebBridge.cs).
var unitySentAt = {};
function sendUnityAction(action) {
  if (!UnitySync.enabled()) {
    // 시연 중 테스트 도구의 '← 이전'/'다음 →'을 한 번이라도 누르면 #1에 다시 올 때까지 영상이 넘어가지 않는다
    console.warn('[Unity bridge] 테스트 도구(이전/다음)로 이동한 뒤라 Unity 동기화가 꺼져 있어 명령을 보내지 않음:', action, '→ #1(처음으로)에서 다시 켜짐');
    return;
  }
  var now = Date.now();
  if (unitySentAt[action] && now - unitySentAt[action] < 2000) {
    console.warn('[Unity bridge] 중복 전송 막음:', action);
    return;
  }
  unitySentAt[action] = now;
  (function attempt(n) {
    fetch('/unity-command', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: action }),
      cache: 'no-store',
      keepalive: true
    }).then(function (res) {
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res.json();
    }).then(function (data) {
      console.info('[Unity bridge] 보냄:', action, '#' + data.id + (data.duplicate ? ' (서버에서 중복으로 처리)' : ''));
    }).catch(function (err) {
      if (n < 3) setTimeout(function () { attempt(n + 1); }, 400 * n);
      else console.error('[Unity bridge] 명령 전송 실패:', action, err);
    });
  })(1);
}

// 페이지 간 이동을 부드러운 크로스페이드로 감싸는 공용 헬퍼.
// body에 opacity 애니메이션을 걸어두고(css: pageFadeIn/page-fade-out),
// goTo()는 fade-out을 먼저 재생한 뒤 실제 location.href 이동을 수행한다.
function goTo(url, delay) {
  delay = delay || 480;
  document.body.classList.add('page-fade-out');
  setTimeout(function () {
    location.href = url;
  }, delay);
}

// 같은 배경이 이어지는 장면 사이(예: #5 → #6 책상 화면)는 페이지를 새로 열지 않고
// 다음 페이지의 화면(.screen)·스타일·스크립트만 현재 문서에 갈아 끼운다.
// 페이지를 새로 열면 브라우저가 첫 프레임을 빈 화면으로 그려 검은색이 깜빡이기 때문.
// 다음 페이지의 인라인 스크립트는 즉시실행 함수로 감싸 실행되므로, 전역 이름에 기대지 말 것(onclick 속성 대신 addEventListener).
// opts.crossfade(ms): 이전 화면을 새 화면 위에 잠시 남겨 두고 서서히 사라지게 한다.
//   연기·파티클처럼 계속 움직이는 배경끼리 이어질 때, 새로 생긴 배경이 툭 바뀌지 않고 겹치며 넘어가도록.
function goToInPlace(url, opts) {
  opts = opts || {};
  return fetch(url, { cache: 'no-store' })
    .then(function (res) { return res.text(); })
    .then(function (html) {
      var doc = new DOMParser().parseFromString(html, 'text/html');
      var loadedSrcs = Array.prototype.map.call(document.scripts, function (s) { return s.getAttribute('src'); });
      var newScripts = Array.prototype.slice.call(doc.body.querySelectorAll('script'));
      // 아직 불러오지 않은 공용 스크립트가 있으면 먼저 불러온다
      var pending = newScripts.filter(function (s) {
        return s.getAttribute('src') && loadedSrcs.indexOf(s.getAttribute('src')) < 0;
      });
      return pending.reduce(function (p, s) {
        return p.then(function () {
          return new Promise(function (resolve) {
            var el = document.createElement('script');
            el.src = s.getAttribute('src');
            el.onload = el.onerror = resolve;
            document.body.appendChild(el);
          });
        });
      }, Promise.resolve()).then(function () {
        // 스타일 → 화면 → 스크립트 순서로 한 번에 교체 (그 사이에 화면이 그려지지 않는다)
        var oldStyles = Array.prototype.slice.call(document.head.querySelectorAll('style'));
        doc.head.querySelectorAll('style').forEach(function (st) {
          document.head.appendChild(document.importNode(st, true));
        });
        document.title = doc.title;
        var oldScreen = document.querySelector('.screen');
        var newScreen = document.importNode(doc.querySelector('.screen'), true);
        if (opts.crossfade) {
          // 새 화면을 아래에 깔고, 이전 화면은 위에서 서서히 사라진 뒤 제거 (id는 새 화면이 갖도록 이전 화면에서 뗀다)
          oldScreen.removeAttribute('id');
          oldScreen.querySelectorAll('[id]').forEach(function (el) { el.removeAttribute('id'); });
          oldScreen.style.pointerEvents = 'none';
          oldScreen.parentNode.insertBefore(newScreen, oldScreen);
          oldScreen.getBoundingClientRect();
          oldScreen.style.transition = 'opacity ' + opts.crossfade + 'ms ease';
          oldScreen.style.opacity = '0';
          setTimeout(function () {
            oldScreen.remove();
            oldStyles.forEach(function (st) { st.remove(); });
          }, opts.crossfade + 50);
        } else {
          oldStyles.forEach(function (st) { st.remove(); });
          oldScreen.replaceWith(newScreen);
        }
        history.pushState({ inPlace: true }, '', url);
        UnitySync.nextScene();
        newScripts.forEach(function (s) {
          if (s.getAttribute('src')) return;
          var el = document.createElement('script');
          el.textContent = '(function () {\n' + s.textContent + '\n})();';
          document.body.appendChild(el);
        });
      });
    });
}
// 갈아 끼운 페이지에서 뒤로가기를 누르면 주소만 바뀌므로, 해당 페이지를 새로 불러온다
window.addEventListener('popstate', function () {
  location.reload();
});

// 뒤로가기로 캐시된 페이지가 복원되면 fade-out 상태(검은 화면)로 남아 있으므로 새로 불러온다
window.addEventListener('pageshow', function (e) {
  if (e.persisted) location.reload();
});

// ---------- [프로토타입 전용] 좌측 상단 테스트 도구 (이동 버튼 + 스크린 연출 노트) ----------
// 완성본에서는 이 블록 전체, wireframe.css의 [프로토타입 전용] 스타일, 각 페이지의 showScreenNotes(...) 호출만 지우면 된다.
// 체험 순서 (다음 버튼용). 페이지를 추가·삭제·이름 변경하면 여기도 맞춰 줄 것
var DEV_FLOW = [
  'page1_door.html',
  'page2_transition.html',
  'page3_guide_intro.html',
  'page4_smoke_gate.html',
  'page5_oracle_room.html',
  'page6_birth_paper.html',
  'page7_star_search.html',
  'page8_constellation_card.html',
  'page9_constellation_info.html',
  'page10_star_story.html',
  'page11_fortune_select.html',
  'page12_keyword_select.html',
  'page13_fortune_reading.html',
  'page14_interpretation.html',
  'page15_dashboard.html',
  'page16_gift_card.html',
  'page17_qr.html',
  'page18_farewell.html',
  'page19_pullback.html',
  'page20_reverse_flow.html',
  'page21_door_exit.html',
  'page22_door_close.html',
];
function devCurrentIndex() {
  return DEV_FLOW.indexOf(location.pathname.split('/').pop() || 'page1_door.html');
}
function devNextPage() {
  return DEV_FLOW[(devCurrentIndex() + 1) % DEV_FLOW.length];
}
// '← 이전'은 체험 순서상 바로 앞 장면을 처음부터 다시 연다 (브라우저 방문 기록과 무관)
function devPrevPage() {
  var i = devCurrentIndex();
  return DEV_FLOW[i > 0 ? i - 1 : 0];
}

function ensureDevTools() {
  var tools = document.querySelector('.dev-tools');
  if (tools) return tools;
  tools = document.createElement('div');
  tools.className = 'dev-tools';
  tools.innerHTML =
    '<div class="dev-nav">' +
      '<button type="button" data-act="back">← 이전</button>' +
      '<button type="button" data-act="home">처음으로</button>' +
      '<button type="button" data-act="next">다음 →</button>' +
    '</div>' +
    '<div class="dev-notes">' +
      '<div class="dev-notes-head">스크린 영상 연출 (권장 타이밍)</div>' +
      '<ol class="dev-notes-list"></ol>' +
      '<div class="dev-notes-foot"></div>' +
    '</div>';
  tools.querySelector('.dev-nav').addEventListener('click', function (e) {
    var act = e.target.dataset.act;
    // 장면을 건너뛰면 Unity 영상과 어긋나므로 동기화와 명령 전송을 끈다 (#1에 오면 다시 켜짐)
    try { if (act === 'back' || act === 'next') sessionStorage.setItem('unitySyncOff', '1'); } catch (err) {}
    if (act === 'back') location.href = devPrevPage();
    if (act === 'home') location.href = 'page1_door.html';
    if (act === 'next') location.href = devNextPage();
  });
  tools.querySelector('.dev-notes-head').addEventListener('click', function () {
    tools.classList.toggle('notes-collapsed');
    try { localStorage.setItem('devNotesCollapsed', tools.classList.contains('notes-collapsed') ? '1' : ''); } catch (e) {}
  });
  try { if (localStorage.getItem('devNotesCollapsed')) tools.classList.add('notes-collapsed'); } catch (e) {}
  document.body.appendChild(tools);
  avoidPageCornerButton(tools);
  return tools;
}

// 페이지 자체의 좌측 상단 버튼(.corner-btn, 예: #12 뒤로가기)을 가리지 않도록 테스트 도구를 그 아래로 내린다
function avoidPageCornerButton(tools) {
  tools.style.top = '';
  var corner = document.querySelector('.screen .corner-btn');
  if (!corner) return;
  var r = corner.getBoundingClientRect();
  if (r.left < 360 && r.top < 160) tools.style.top = Math.round(r.bottom + 12) + 'px';
}
window.addEventListener('resize', function () {
  var tools = document.querySelector('.dev-tools');
  if (tools) avoidPageCornerButton(tools);
});

function formatSceneTime(ms) {
  var sign = ms < 0 ? '-' : '';
  var s = Math.abs(ms) / 1000;
  var m = Math.floor(s / 60);
  var rest = (s - m * 60).toFixed(1);
  return sign + m + ':' + (rest < 10 ? '0' : '') + rest;
}

// steps: [{ at: ms, text }] - 이 장면이 시작된 시점부터 스크린 영상에서 일어나는 일
// opts.total: 장면 길이(ms). opts.waitInput: 마지막에 관람객 입력을 기다리는 장면이면 true
// opts.videoStart: 이 장면이 시작되는 영상 시각(#1 터치 = 0). 주면 steps의 at과 opts.total을 영상 시각으로 받고,
//   목록의 시각과 경과도 영상 시각으로 보여준다 (스크린 영상의 타임코드와 바로 비교할 수 있도록)
var devNotesTimer = null;
function showScreenNotes(steps, opts) {
  opts = opts || {};
  var base = opts.videoStart != null ? opts.videoStart : 0;
  var total = opts.total != null ? opts.total - base : null;
  // 시각 순서대로 정렬 (같은 시각이면 적힌 순서 유지)
  steps = steps.map(function (st, i) { return { at: st.at - base, text: st.text, i: i }; })
    .sort(function (x, y) { return x.at - y.at || x.i - y.i; });
  var tools = ensureDevTools();
  avoidPageCornerButton(tools);
  tools.querySelector('.dev-notes-head').textContent =
    '스크린 영상 연출 (' + (opts.videoStart != null ? '영상 기준 시각' : '권장 타이밍') + ')';
  var list = tools.querySelector('.dev-notes-list');
  var foot = tools.querySelector('.dev-notes-foot');
  list.innerHTML = '';
  steps.forEach(function (step) {
    var li = document.createElement('li');
    li.innerHTML = '<span class="t">' + formatSceneTime(step.at + base) + '</span><span class="d"></span>';
    li.querySelector('.d').textContent = step.text;
    list.appendChild(li);
  });
  var lengthText;
  if (total != null) lengthText = '씬 길이: ' + (total / 1000).toFixed(1) + '초' + (opts.waitInput ? ' + 관람객 입력 대기' : '');
  else lengthText = '씬 길이: 관람객 입력 시까지';
  var start = performance.now();
  clearInterval(devNotesTimer);
  function tick() {
    var elapsed = performance.now() - start;
    var items = list.children;
    for (var i = 0; i < steps.length; i++) {
      var next = steps[i + 1] ? steps[i + 1].at : Infinity;
      var cls = elapsed >= next ? 'past' : elapsed >= steps[i].at ? 'now' : '';
      if (cls === 'now' && items[i].className !== 'now') {
        // 현재 단계가 바뀌면 목록 안에서만 보이도록 스크롤 (페이지는 움직이지 않음)
        list.scrollTop = items[i].offsetTop - list.offsetTop - list.clientHeight / 3;
      }
      items[i].className = cls;
    }
    var s = UnitySync.state();
    var unityText = !UnitySync.enabled() ? 'Unity 동기화 끔' : s ? 'Unity 영상 ' + (s.video < 10 ? '0' : '') + s.video : 'Unity 미연결';
    foot.innerHTML = '<span>' + lengthText + ' · ' + unityText + '</span><span>' + (opts.videoStart != null ? '영상 ' : '경과 ') + formatSceneTime(elapsed + base) + '</span>';
  }
  tick();
  devNotesTimer = setInterval(tick, 200);
}

document.addEventListener('DOMContentLoaded', function () {
  var tools = ensureDevTools();
  if (!tools.querySelector('.dev-notes-list').children.length) {
    showScreenNotes([{ at: 0, text: '(이 장면의 스크린 연출은 아직 정리 전)' }]);
  }
});

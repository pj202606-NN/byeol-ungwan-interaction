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
var devNotesTimer = null;
function showScreenNotes(steps, opts) {
  opts = opts || {};
  // 시각 순서대로 정렬 (같은 시각이면 적힌 순서 유지)
  steps = steps.map(function (st, i) { return { at: st.at, text: st.text, i: i }; })
    .sort(function (x, y) { return x.at - y.at || x.i - y.i; });
  var tools = ensureDevTools();
  avoidPageCornerButton(tools);
  var list = tools.querySelector('.dev-notes-list');
  var foot = tools.querySelector('.dev-notes-foot');
  list.innerHTML = '';
  steps.forEach(function (step) {
    var li = document.createElement('li');
    li.innerHTML = '<span class="t">' + formatSceneTime(step.at) + '</span><span class="d"></span>';
    li.querySelector('.d').textContent = step.text;
    list.appendChild(li);
  });
  var lengthText;
  if (opts.total != null) lengthText = '씬 길이: ' + (opts.total / 1000).toFixed(1) + '초' + (opts.waitInput ? ' + 관람객 입력 대기' : '');
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
    foot.innerHTML = '<span>' + lengthText + '</span><span>경과 ' + formatSceneTime(elapsed) + '</span>';
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

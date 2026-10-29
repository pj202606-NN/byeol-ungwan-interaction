// 나래이션 자막 순차 재생 공용 헬퍼 (#3, #5). 스타일은 oracle.css의 .guide-subtitle.
// lines: [{ text, hold, gap }] - hold: 자막이 완전히 보이는 시간, gap: 사라진 뒤 다음 대사까지 쉬는 시간 (ms)
// fade: 나타나고/사라지는 데 걸리는 시간. CSS의 transition(1.4s)과 맞춰둔다.
var SUBTITLE_FADE = 1400;

function subtitleWait(ms) {
  return new Promise(function (r) { setTimeout(r, ms); });
}

async function playSubtitles(el, lines) {
  for (var i = 0; i < lines.length; i++) {
    el.innerHTML = lines[i].text;
    el.classList.add('show');
    await subtitleWait(SUBTITLE_FADE + lines[i].hold);
    el.classList.remove('show');
    await subtitleWait(SUBTITLE_FADE + (lines[i].gap || 0));
  }
}

// 대사별 시작 시각 계산 (스크린 연출 노트용). startAt부터 재생했을 때 각 대사가 나타나기 시작하는 시각과 전체 끝 시각
function subtitleSchedule(lines, startAt) {
  var t = startAt || 0;
  var starts = [];
  lines.forEach(function (l) {
    starts.push(t);
    t += SUBTITLE_FADE * 2 + l.hold + (l.gap || 0);
  });
  return { starts: starts, end: t };
}
// ---------- 영상 시각에 맞춘 자막 (#3, #5, #6) ----------
// 시각은 모두 "영상 시각"(ms): 관람객이 #1의 문을 터치한 순간을 0으로 하는 스크린 영상 기준.
// lines: [{ text, at, out }]
//   at: 그 대사의 음성이 시작되는 영상 시각. 자막은 SUBTITLE_LEAD만큼 먼저 떠오르기 시작한다.
//   out: 자막이 사라지기 시작하는 영상 시각. 생략하면 다음 자막이 떠오르기 직전에 다 사라지도록 맞추고,
//        마지막 대사에서 생략하면 장면이 끝날 때까지 남는다.
// 자막이 음성보다 빠르거나 느리게 느껴지면 이 값만 조절하면 된다 (작을수록 자막이 늦게 뜬다)
var SUBTITLE_LEAD = 0;
//   video: 그 대사가 나오는 영상 번호 (장면 시계를 넘길 때만. 생략하면 장면의 기준 영상). 영상이 다른 대사끼리는 out을 꼭 적는다
function subtitleCues(lines) {
  var lead = SUBTITLE_LEAD;
  return lines.map(function (l, i) {
    var next = lines[i + 1];
    var hide = l.out != null ? l.out : next ? next.at - lead - SUBTITLE_FADE : null;
    return { text: l.text, video: l.video, show: l.at - lead, hide: hide };
  });
}
// clock: UnitySync.clock(...)로 만든 장면 시계 → Unity 영상의 실제 재생 시각에 맞춘다.
//   숫자를 넘기면 이 장면의 스크립트가 실행되는 순간의 영상 시각(sceneStart)으로 보고 자체 타이머로 맞춘다.
// 돌려주는 Promise는 마지막 자막이 다 사라진 순간에 끝난다 (마지막 자막에 out이 없으면 마지막 자막이 뜨는 순간)
function playSubtitlesAt(el, lines, clock) {
  var cue = typeof clock === 'number'
    ? function (video, ms) { return subtitleWait(Math.max(0, ms - clock)); }
    : function (video, ms) { return clock.at(video || clock.video, ms); };
  var done = Promise.resolve();
  subtitleCues(lines).forEach(function (c) {
    var shown = cue(c.video, c.show).then(function () {
      el.innerHTML = c.text;
      el.classList.add('show');
    });
    done = shown;
    if (c.hide != null) {
      done = cue(c.video, c.hide).then(function () { return shown; }).then(function () {
        el.classList.remove('show');
        return subtitleWait(SUBTITLE_FADE);
      });
    }
  });
  return done;
}
// clock을 넘기면 다른 영상의 대사도 장면 기준 영상의 연속 시각으로 바꿔 적는다 (개발 노트용)
function cueNotes(lines, prefix, clock) {
  return lines.map(function (l) {
    var at = clock && l.video ? clock.noteTime(l.video, l.at) : l.at;
    return { at: at, text: (prefix || '대사') + ': "' + l.text.replace(/<br>/g, ' ') + '"' };
  });
}

function lineNotes(lines, schedule, prefix) {
  return lines.map(function (l, i) {
    return { at: schedule.starts[i], text: (prefix || '대사') + ': "' + l.text.replace(/<br>/g, ' ') + '"' };
  });
}

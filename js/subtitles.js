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
function lineNotes(lines, schedule, prefix) {
  return lines.map(function (l, i) {
    return { at: schedule.starts[i], text: (prefix || '대사') + ': "' + l.text.replace(/<br>/g, ' ') + '"' };
  });
}

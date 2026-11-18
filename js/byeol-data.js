// 별운관 28수 데이터 공용 모듈 (전역 ByeolData)
// - 실제로 읽는 파일은 data/manifest.json에 적힌 것뿐이다 (예전 v3~v6는 data/archive/에 보관만 하고 읽지 않는다).
// - 생일 기준·소개·키워드는 숫자 ID(1~28)로 잇는다. 별 이야기(byeolungwan_fortunes_2026-11-20_24.json)는 28수 이름('각수' 등)이
//   키라서, 아래 MANSION_KEYS의 ID → 키 표로만 잇고 이름·한자·사신수가 생일 기준과 같은지 확인한다 (객체 순서로 짐작하지 않는다).
// - 데이터에 없는 문구는 만들지 않는다. 찾지 못하면 오류로 처리하고 임의의 별자리·이야기를 보여 주지 않는다.
//
// 흐름
//   #6 '건넨다'  → ByeolData.load() → buildVisit(): 입력 검증 → (음력이면) 양력 변환 → 별자리 판정 → 이야기 날짜 결정
//                → 이 관람객의 별자리 정보와 이야기(오늘 6 + 이달 6 + 올해 6건)만 sessionStorage 'visitData'에 저장
//   #7~#17       → ByeolData.getVisit()으로 읽기만 한다 (큰 JSON을 다시 받지 않는다)
//   #1           → nav.js clearVisitData()가 'visitData'도 지운다
//
// 페이지에서는 <script src="js/vendor/korean-lunar-calendar.min.js">(음력 변환, #6만 필요) 다음에 이 파일을 불러온다.
// Node에서도 require할 수 있다 (tests/byeol-data.test.js).
(function (root, factory) {
  var api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.ByeolData = api;
})(typeof self !== 'undefined' ? self : this, function (root) {
  'use strict';

  var DATA_DIR = 'data/';
  var VISIT_KEY = 'visitData';
  var VISIT_VERSION = 2;                 // 2: 2026-11-20~24 최종 이야기 데이터 (예전 기록은 버린다)
  var TEST_DATE_KEY = 'byeolTestDate';   // 개발용 '오늘' 날짜 (전시 첫날 전에만 쓰인다)
  var YEAR_MIN = 1950;                   // #6 연도 목록과 같게
  var YEAR_MAX = 2026;
  // 인터랙션의 6개 카테고리 (화면 순서). 원본의 '학업·일'은 다른 매체용이라 쓰지 않고, 직장·학업·애정·관계 대신 쓰지도 않는다
  var CATEGORIES = ['종합', '금전', '애정', '직장', '학업', '관계'];
  // 별자리 ID(생일 기준) → 별 이야기 파일의 키. 위(危, 북방 12)와 위(胃, 서방 17)는 키가 따로 있다
  var MANSION_KEYS = [null,
    '각수', '항수', '저수', '방수', '심수', '미수', '기수',          // 1~7 동방청룡
    '두수', '우수', '여수', '허수', '위수(危)', '실수', '벽수',      // 8~14 북방현무
    '규수', '루수', '위수(胃)', '묘수', '필수', '자수', '삼수',      // 15~21 서방백호
    '정수', '귀수', '류수', '성수', '장수', '익수', '진수'];         // 22~28 남방주작
  var FLOWS = ['길', '보통', '주의'];
  // 화면 저장값(today/month/year) ↔ 데이터 값(오늘/이달/올해)
  var PERIOD_DATA = { today: '오늘', month: '이달', year: '올해' };
  var PERIOD_LABEL = { today: '오늘의', month: '이달의', year: '올해의' };
  var MESSAGES = {
    missing: '태어난 해와 달, 날을 모두 골라 주세요.',
    range: YEAR_MIN + '년부터 ' + YEAR_MAX + '년 사이에 태어난 날만 확인할 수 있습니다.',
    hour: '태어난 시각을 다시 골라 주세요.',
    future: '아직 오지 않은 날입니다. 태어난 날을 다시 확인해 주세요.',
    lunarUnavailable: '음력 날짜를 바꾸는 기능을 불러오지 못했습니다. 양력으로 골라 주세요.',
    lunarFailed: '이 음력 날짜를 양력으로 바꾸지 못했습니다. 날짜를 다시 확인해 주세요.',
    noMansion: '이 날짜의 별자리를 찾지 못했습니다. 안내 직원에게 알려 주세요.',
    dataFailed: '별자리 기록을 불러오지 못했습니다. 잠시 후 다시 건네 주세요.',
    saveFailed: '입력한 날을 기록하지 못했습니다. 다시 건네 주세요.',
    visitMissing: '관람객의 별자리 기록이 없습니다. 처음 화면에서 다시 시작해 주세요.',
    storyMissing: '이 별 이야기를 찾지 못했습니다. 처음 화면에서 다시 시작해 주세요.',
  };

  // ---------- 날짜 ----------
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function ymd(y, m, d) { return y + '-' + pad(m) + '-' + pad(d); }
  function isInt(n) { return typeof n === 'number' && isFinite(n) && Math.floor(n) === n; }
  function isLeapYear(y) { return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0; }
  function daysInMonth(y, m) { return [31, isLeapYear(y) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1]; }
  function isValidSolar(y, m, d) { return isInt(y) && isInt(m) && isInt(d) && m >= 1 && m <= 12 && d >= 1 && d <= daysInMonth(y, m); }
  function isYmd(s) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || '');
    return !!m && isValidSolar(+m[1], +m[2], +m[3]);
  }
  // 한국 날짜 (Asia/Seoul). 한국은 1988년 이후 서머타임이 없어 UTC+9로 고정 계산한다 → 태블릿 기기의 시간대 설정과 무관
  function seoulDate(now) {
    var t = now instanceof Date ? now.getTime() : (now == null ? Date.now() : Number(now));
    return new Date(t + 9 * 3600 * 1000).toISOString().slice(0, 10);
  }

  // ---------- 데이터 결합·검사 ----------
  function fail(msg) { throw new Error('[별운관 데이터] ' + msg); }
  function text(v) { return typeof v === 'string' && v.trim() !== ''; }
  function idOk(id) { return isInt(id) && id >= 1 && id <= 28; }

  // raw: { manifest, reference, stories, descriptions, keywords } (각 JSON 원본)
  function buildDb(raw) {
    var manifest = raw.manifest || {};
    // 오늘 이야기의 날짜 범위와 범위 밖 규칙은 별 이야기 파일의 설정을 그대로 쓴다 (여기서 날짜를 따로 적지 않는다)
    var st = raw.stories || {};
    if (st.timezone !== 'Asia/Seoul') fail('별 이야기 파일의 timezone이 Asia/Seoul이 아님: ' + st.timezone);
    if (!isYmd(st.dailyStart) || !isYmd(st.dailyEnd) || st.dailyStart > st.dailyEnd) fail('별 이야기 파일의 dailyStart·dailyEnd가 올바르지 않음');
    if (st.beforeStart !== 'first' || st.afterEnd !== 'last') fail('지원하지 않는 날짜 규칙: beforeStart=' + st.beforeStart + ', afterEnd=' + st.afterEnd);
    var storyDays = [];
    for (var t = Date.parse(st.dailyStart + 'T00:00:00Z'); ; t += 86400000) {
      var s = new Date(t).toISOString().slice(0, 10);
      storyDays.push(s);
      if (s >= st.dailyEnd) break;
    }

    // ① 생일 기준
    var ref = raw.reference && raw.reference.mansions;
    if (!Array.isArray(ref) || ref.length !== 28) fail('생일 기준 파일의 mansions가 28개가 아님');
    var mansions = {};
    ref.forEach(function (m) {
      if (!idOk(m.id)) fail('생일 기준 ID가 1~28 정수가 아님: ' + m.id);
      if (mansions[m.id]) fail('생일 기준 ID 중복: ' + m.id);
      ['name', 'mansion', 'sashin', 'animal'].forEach(function (k) { if (!text(m[k])) fail('생일 기준 ' + m.id + '의 ' + k + ' 없음'); });
      if (!m.start || !m.end || !isValidSolar(2024, m.start.month, m.start.day) || !isValidSolar(2024, m.end.month, m.end.day)) fail('생일 기준 ' + m.id + '의 생일 범위가 올바르지 않음');
      mansions[m.id] = {
        id: m.id,
        name: m.name,
        mansion: m.mansion,
        sashin: m.sashin,
        animal: m.animal,
        element: m.element || '',
        chilYo: m.chil_yo || '',
        dateRange: m.date_range || '',
        start: { month: m.start.month, day: m.start.day },
        end: { month: m.end.month, day: m.end.day },
        shortAnalysis: m.short_analysis || '',
      };
    });
    // 윤년 기준 366일이 빠짐없이 정확히 한 별자리에 들어가는지 (겹치거나 비면 판정을 믿을 수 없으므로 데이터 오류)
    for (var mo = 1; mo <= 12; mo++) {
      for (var d = 1; d <= daysInMonth(2024, mo); d++) {
        var hits = matchMansions(mansions, mo, d);
        if (hits.length !== 1) fail(mo + '월 ' + d + '일이 ' + (hits.length ? '여러 별자리(' + hits.join(',') + ')에 겹침' : '어느 별자리에도 없음'));
      }
    }

    // ③ 소개 문구
    var desc = raw.descriptions;
    if (!Array.isArray(desc) || desc.length !== 28) fail('소개 문구가 28개가 아님');
    desc.forEach(function (row) {
      var m = mansions[row['번호']];
      if (!m) fail('소개 문구의 번호가 1~28이 아님: ' + row['번호']);
      if (m.intro !== undefined) fail('소개 문구 번호 중복: ' + row['번호']);
      if (row['별자리'] !== m.name || row['28수'] !== m.mansion) fail('소개 문구 ' + m.id + '의 이름·한자가 생일 기준과 다름');
      if (!text(row['결과_소개'])) fail('소개 문구 ' + m.id + '의 결과_소개 없음');
      m.intro = row['결과_소개'];
    });

    // 성격 키워드 (v6 원문에서 키워드만 분리한 파일)
    var kw = raw.keywords && raw.keywords.keywords;
    if (!Array.isArray(kw) || kw.length !== 28) fail('키워드가 28개가 아님');
    kw.forEach(function (row) {
      var m = mansions[row['번호']];
      if (!m) fail('키워드의 번호가 1~28이 아님: ' + row['번호']);
      if (m.keywords) fail('키워드 번호 중복: ' + row['번호']);
      if (row['별자리'] !== m.name) fail('키워드 ' + m.id + '의 이름이 생일 기준과 다름');
      if (!Array.isArray(row['키워드']) || !row['키워드'].length || !row['키워드'].every(text)) fail('키워드 ' + m.id + '가 비어 있음');
      m.keywords = row['키워드'].slice();
    });

    // ② 별 이야기: constellations[키].daily[날짜][카테고리] · monthly[카테고리] · yearly[카테고리] · analysis
    //   필드: short(간략) · detail(상세) · fortune(운세 흐름, 오늘만 씀) · ultraShort·advice(있는 항목만)
    var cons = st.constellations;
    if (!cons || typeof cons !== 'object') fail('별 이야기 파일에 constellations가 없음');
    var keys = Object.keys(cons);
    if (keys.length !== 28) fail('별 이야기 파일의 별자리가 28개가 아님: ' + keys.length);
    var stories = {};
    function addStory(id, periodData, category, date, e, where) {
      if (!e || !text(e.short) || !text(e.detail)) fail('별 이야기 ' + where + '의 short·detail 없음');
      var rec = { short: e.short, detail: e.detail };
      if (periodData === '오늘') {
        if (FLOWS.indexOf(e.fortune) < 0) fail('별 이야기 ' + where + '의 fortune이 길·보통·주의가 아님: ' + e.fortune);
        rec.fortune = e.fortune;
      }
      if (e.ultraShort !== undefined) { if (!text(e.ultraShort)) fail('별 이야기 ' + where + '의 ultraShort가 비어 있음'); rec.ultraShort = e.ultraShort; }
      if (e.advice !== undefined) { if (!text(e.advice)) fail('별 이야기 ' + where + '의 advice가 비어 있음'); rec.advice = e.advice; }
      stories[storyKey(id, periodData, category, date)] = rec;
    }
    var usedKeys = {};
    for (var id = 1; id <= 28; id++) {
      var m = mansions[id], key = MANSION_KEYS[id], c = cons[key];
      if (!c) fail('별 이야기 파일에 ' + id + '번 키(' + key + ')가 없음');
      if (usedKeys[key]) fail('별 이야기 키 중복: ' + key);
      usedKeys[key] = true;
      if (c.name !== m.name || c.hanja !== m.mansion || c.direction !== m.sashin) {
        fail('별 이야기 ' + key + '의 이름·한자·사신수(' + [c.name, c.hanja, c.direction].join('/') + ')가 생일 기준 ' + id + '번(' + [m.name, m.mansion, m.sashin].join('/') + ')과 다름');
      }
      if (!c.analysis || typeof c.analysis !== 'object' || !Object.keys(c.analysis).length || !Object.keys(c.analysis).every(function (k) { return text(c.analysis[k]); })) fail('별 이야기 ' + key + '의 analysis가 비어 있음');
      CATEGORIES.forEach(function (cat) {
        storyDays.forEach(function (day) { addStory(id, '오늘', cat, day, c.daily && c.daily[day] && c.daily[day][cat], key + ' ' + day + ' ' + cat); });
        addStory(id, '이달', cat, null, c.monthly && c.monthly[cat], key + ' 이달 ' + cat);
        addStory(id, '올해', cat, null, c.yearly && c.yearly[cat], key + ' 올해 ' + cat);
      });
    }

    return { files: manifest.files || {}, storyDays: storyDays, mansions: mansions, stories: stories, storyCount: Object.keys(stories).length };
  }

  function storyKey(id, periodData, category, date) { return id + '|' + periodData + '|' + category + '|' + (date || ''); }

  function inRange(m, month, day) {
    var md = month * 100 + day;
    var s = m.start.month * 100 + m.start.day;
    var e = m.end.month * 100 + m.end.day;
    return s <= e ? md >= s && md <= e : md >= s || md <= e;   // 12.28~01.17처럼 해를 넘기는 구간
  }
  function matchMansions(mansions, month, day) {
    var ids = [];
    for (var id = 1; id <= 28; id++) if (mansions[id] && inRange(mansions[id], month, day)) ids.push(id);
    return ids;
  }
  // 양력 월·일 → 별자리 ID. 정확히 하나가 아니면 오류 (임의로 고르지 않는다)
  function mansionIdFor(db, month, day) {
    if (!isValidSolar(2024, month, day)) fail('올바르지 않은 월·일: ' + month + '/' + day);
    var ids = matchMansions(db.mansions, month, day);
    if (ids.length !== 1) fail(month + '월 ' + day + '일의 별자리를 하나로 정하지 못함 (' + ids.join(',') + ')');
    return ids[0];
  }

  // ---------- 생년월일 ----------
  function lunarClass(Lunar) { return Lunar || root.KoreanLunarCalendar || null; }
  // 그 음력 해의 윤달(없으면 0)
  function leapMonthOf(Lunar, year) {
    var c = new Lunar();
    for (var m = 1; m <= 12; m++) if (c.setLunarDate(year, m, 1, true)) return m;
    return 0;
  }

  // input: { calendar: 'solar'|'lunar', year, month, day, leap(음력 윤달 여부), hour(0~23 또는 null=모름) }
  // → { ok: true, solar: {year, month, day} } 또는 { ok: false, code, message }
  function resolveBirth(input, now, Lunar) {
    input = input || {};
    var y = input.year, m = input.month, d = input.day;
    var bad = function (code, message) { return { ok: false, code: code, message: message || MESSAGES[code] }; };
    if (!isInt(y) || !isInt(m) || !isInt(d)) return bad('missing');
    if (y < YEAR_MIN || y > YEAR_MAX) return bad('range');
    if (m < 1 || m > 12 || d < 1 || d > 31) return bad('invalid', '존재하지 않는 날짜입니다. 다시 골라 주세요.');
    if (!(input.hour === null || (isInt(input.hour) && input.hour >= 0 && input.hour <= 23))) return bad('hour');
    var solar;
    if (input.calendar === 'lunar') {
      var L = lunarClass(Lunar);
      if (!L) return bad('lunarUnavailable');
      var leap = !!input.leap;
      var c = new L();
      if (leap && !c.setLunarDate(y, m, 1, true)) {
        var lm = leapMonthOf(L, y);
        return bad('noLeapMonth', '음력 ' + y + '년에는 윤' + m + '월이 없습니다. ' + (lm ? '이 해의 윤달은 윤' + lm + '월입니다.' : '이 해에는 윤달이 없습니다.'));
      }
      if (!c.setLunarDate(y, m, d, leap)) {
        var last = c.setLunarDate(y, m, 30, leap) ? 30 : (c.setLunarDate(y, m, 29, leap) ? 29 : 0);
        if (!last || d <= last) return bad('lunarFailed');
        return bad('invalid', '음력 ' + y + '년 ' + (leap ? '윤' : '') + m + '월은 ' + last + '일까지 있습니다.');
      }
      solar = c.getSolarCalendar();
      if (!isValidSolar(solar.year, solar.month, solar.day)) return bad('lunarFailed');
    } else if (input.calendar === 'solar' || input.calendar == null) {
      if (!isValidSolar(y, m, d)) return bad('invalid', y + '년 ' + m + '월은 ' + daysInMonth(y, m) + '일까지 있습니다.');
      solar = { year: y, month: m, day: d };
    } else {
      return bad('missing');
    }
    if (ymd(solar.year, solar.month, solar.day) > seoulDate(now)) return bad('future');
    return { ok: true, solar: { year: solar.year, month: solar.month, day: solar.day } };
  }

  // ---------- 이야기 날짜 ----------
  // 오늘 이야기의 날짜 = 한국 날짜를 별 이야기 파일의 범위(dailyStart~dailyEnd)에 맞춘 것.
  //   첫날 전 → 첫날(beforeStart: first) · 범위 안 → 그날 · 마지막 날 뒤 → 마지막 날(afterEnd: last)
  // 관람객마다 #6 '건넨다' 순간에 한 번 정해 기록에 넣으므로, 체험 도중 자정이 지나도 #14·#15의 날짜가 섞이지 않고,
  // 다음 관람객은 그 순간의 날짜로 새로 정해진다 (페이지 새로고침·서버 재시작 없이 자정에 자동으로 넘어감).
  // testDate: 개발용 '오늘' (전시 첫날 전에만 쓴다. 첫날부터는 무시)
  // → { date: 'YYYY-MM-DD', status: 'live' | 'before' | 'after' | 'test', today: 실제 한국 날짜, simulated: 개발용 날짜 | null }
  function storyDate(db, now, testDate) {
    var real = seoulDate(now);
    var first = db.storyDays[0], last = db.storyDays[db.storyDays.length - 1];
    var sim = testDate && isYmd(testDate) && real < first ? testDate : null;
    var day = sim || real;
    var date = day < first ? first : day > last ? last : day;
    var status = sim ? 'test' : day < first ? 'before' : day > last ? 'after' : 'live';
    return { date: date, status: status, today: real, simulated: sim };
  }

  // 개발용 '오늘': 아무 페이지 주소 뒤에 ?testDate=2026-11-22 (끄기: ?testDate=off). 이 기기(브라우저)에만 저장되고 화면에는 보이지 않는다.
  // 전시 첫날(dailyStart)부터는 storyDate()가 무시하므로 전시 중 남아 있어도 관람객에게 영향이 없다.
  function testDate() {
    try {
      var q = /[?&]testDate=([^&#]*)/.exec(root.location ? root.location.search : '');
      if (q) {
        var v = decodeURIComponent(q[1]);
        if (isYmd(v)) root.localStorage.setItem(TEST_DATE_KEY, v);
        else root.localStorage.removeItem(TEST_DATE_KEY);
      }
      var saved = root.localStorage.getItem(TEST_DATE_KEY);
      return isYmd(saved) ? saved : null;
    } catch (e) { return null; }
  }

  // ---------- 관람객 기록 ----------
  function profileOf(db, id) {
    var m = db.mansions[id];
    if (!m || !m.intro || !m.keywords) fail('별자리 ' + id + '의 정보가 없음');
    return JSON.parse(JSON.stringify(m));
  }
  // 화면에서 쓰는 이름으로: brief = short(간략) · detail = detail(상세) · flow = fortune(운세 흐름, 오늘만) · ultraShort·advice(있으면)
  function storyRecord(e, period, category, date) {
    if (!e) fail('별 이야기 없음: ' + period + ' ' + category + ' ' + (date || ''));
    var rec = { period: period, category: category, date: date || null, brief: e.short, detail: e.detail };
    if (e.fortune !== undefined) rec.flow = e.fortune;
    if (e.ultraShort !== undefined) rec.ultraShort = e.ultraShort;
    if (e.advice !== undefined) rec.advice = e.advice;
    return rec;
  }

  // #6에서 한 번만 부른다. 판정에 출생 시각은 쓰지 않는다.
  // → { ok: true, visit } 또는 { ok: false, code, message }
  function buildVisit(db, input, now, opts) {
    opts = opts || {};
    var birth = resolveBirth(input, now, opts.Lunar);
    if (!birth.ok) return birth;
    var id, profile;
    try {
      id = mansionIdFor(db, birth.solar.month, birth.solar.day);
      profile = profileOf(db, id);
    } catch (e) {
      return { ok: false, code: 'noMansion', message: MESSAGES.noMansion, error: String(e.message || e) };
    }
    var sd = storyDate(db, now, opts.testDate !== undefined ? opts.testDate : testDate());
    var stories = { today: {}, month: {}, year: {} };
    CATEGORIES.forEach(function (c) {
      stories.today[c] = storyRecord(db.stories[storyKey(id, '오늘', c, sd.date)], 'today', c, sd.date);
      stories.month[c] = storyRecord(db.stories[storyKey(id, '이달', c, null)], 'month', c, null);
      stories.year[c] = storyRecord(db.stories[storyKey(id, '올해', c, null)], 'year', c, null);
    });
    return {
      ok: true,
      visit: {
        v: VISIT_VERSION,
        createdAt: new Date(now == null ? Date.now() : now).toISOString(),
        birth: {
          calendar: input.calendar === 'lunar' ? 'lunar' : 'solar',
          year: input.year, month: input.month, day: input.day,
          leap: input.calendar === 'lunar' ? !!input.leap : false,
          hour: input.hour === null ? null : input.hour,
          solar: birth.solar,
        },
        mansionId: id,
        profile: profile,
        storyDate: sd,
        stories: stories,
        dataFiles: db.files,
      },
    };
  }

  function validVisit(v) {
    return !!v && v.v === VISIT_VERSION && idOk(v.mansionId) && v.profile && v.profile.id === v.mansionId && v.stories && v.stories.today && v.stories.month && v.stories.year;
  }
  function saveVisit(visit) {
    try { root.sessionStorage.setItem(VISIT_KEY, JSON.stringify(visit)); return true; } catch (e) { console.error('[별운관 데이터] 관람객 기록 저장 실패', e); return false; }
  }
  function getVisit() {
    try {
      var v = JSON.parse(root.sessionStorage.getItem(VISIT_KEY));
      return validVisit(v) ? v : null;
    } catch (e) { return null; }
  }

  // 관람객 별자리의 이야기 하나. period: today|month|year, category: 종합…관계
  // → { mansionId, name, period, category, date, brief(short), detail, flow(fortune, 오늘만), ultraShort·advice(있으면) } · 찾지 못하면 null
  //   (이 관람객의 기록 = #6에서 정한 한 날짜의 이야기만 들어 있으므로, 체험 중 자정이 지나도 같은 날짜로 일관된다)
  function getStory(visit, period, category) {
    if (!validVisit(visit) || !PERIOD_DATA[period] || CATEGORIES.indexOf(category) < 0) return null;
    var rec = visit.stories[period] && visit.stories[period][category];
    if (!rec || !text(rec.brief) || !text(rec.detail)) return null;
    var out = { mansionId: visit.mansionId, name: visit.profile.name, period: period, category: category, date: rec.date, brief: rec.brief, detail: rec.detail };
    ['flow', 'ultraShort', 'advice'].forEach(function (k) { if (rec[k] !== undefined) out[k] = rec[k]; });
    return out;
  }

  // ---------- 화면 문구 ----------
  function periodTitle(period) { return PERIOD_LABEL[period] ? PERIOD_LABEL[period] + ' 별 이야기' : ''; }
  function storyTitle(period, category) { return periodTitle(period) && category ? periodTitle(period) + ' - ' + category : ''; }

  // 세션 기록이 없을 때(테스트 도구로 건너뛰었거나 저장 실패) 화면 가운데에 안내를 띄운다.
  // 이 안내만 터치를 받고, 나머지 화면(테스트 도구 등)은 그대로 쓸 수 있다.
  function showVisitError(message) {
    if (typeof document === 'undefined') return;
    console.error('[별운관 데이터]', message || MESSAGES.visitMissing);
    if (!document.getElementById('byeol-data-style')) {
      var st = document.createElement('style');
      st.id = 'byeol-data-style';
      st.textContent =
        '.byeol-data-error{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);z-index:50;max-width:720px;padding:32px 44px;' +
        'background:rgba(12,10,8,0.88);border:1px solid rgba(255,255,255,0.35);border-radius:8px;color:#fff;font-size:22px;line-height:1.6;' +
        'text-align:center;font-family:"BonMyeongjo","Malgun Gothic",sans-serif;pointer-events:auto}' +
        '.byeol-data-error button{margin-top:22px}';
      document.head.appendChild(st);
    }
    var screen = document.querySelector('.screen') || document.body;
    if (screen.querySelector('.byeol-data-error')) return;
    var box = document.createElement('div');
    box.className = 'byeol-data-error';
    box.setAttribute('role', 'alert');
    var p = document.createElement('div');
    p.textContent = message || MESSAGES.visitMissing;
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn btn-light';
    btn.textContent = '처음으로';
    btn.addEventListener('click', function () {
      if (typeof root.returnToDoor === 'function') root.returnToDoor();
      else root.location.href = 'page1_door.html';
    });
    box.appendChild(p);
    box.appendChild(btn);
    screen.appendChild(box);
  }
  function requireVisit() {
    var v = getVisit();
    if (!v) showVisitError();
    return v;
  }

  // ---------- 카드 이미지 (public/assets/cards/) ----------
  // 앞면: card_01.jpg ~ card_28.jpg (별자리 ID를 두 자리로), 뒷면: card_back.jpg. 원본 비율 1748×3591.
  // 카드 자리(.card-object)의 크기·위치·애니메이션은 그대로 두고, 그 안 가운데에 원래 비율로 이미지를 넣는다 (oracle.css .card-art).
  // 이름·한자는 카드 그림에 이미 있으므로 카드 위에 글자로 겹쳐 쓰지 않는다 (ID·이름 데이터는 visitData에 그대로).
  var CARD_DIR = 'assets/cards/';
  var CARD_BACK = CARD_DIR + 'card_back.jpg';
  function cardImage(id) {
    id = Number(id);
    if (!(id >= 1 && id <= 28 && Math.floor(id) === id)) return null;
    return CARD_DIR + 'card_' + (id < 10 ? '0' : '') + id + '.jpg';
  }
  function setCardArt(el, src, alt) {
    el.textContent = '';
    el.classList.add('has-card-art');
    var img = document.createElement('img');
    img.className = 'card-art';
    img.src = src;
    img.alt = alt;
    img.draggable = false;
    el.appendChild(img);
    return img;
  }
  // 별자리 카드 앞면 (#8·#9·#10·#15)
  function fillCard(el, profile) {
    if (!el || !profile) return;
    el.setAttribute('data-mansion-id', String(profile.id));
    var src = cardImage(profile.id);
    if (!src) { console.error('[별운관 데이터] 카드 이미지가 없는 별자리 ID:', profile.id); return; }
    setCardArt(el, src, profile.name);
  }
  // 공통 카드 뒷면 (#16·#17)
  function fillCardBack(el) {
    if (el) setCardArt(el, CARD_BACK, '');
  }
  // ---------- 결과 QR (public/assets/qr/qr_01.svg ~ qr_28.svg) ----------
  // 별자리 ID → 두 자리 번호의 SVG. 원본 파일은 그대로 두고, 화면에서만 SVG를 문서 안에 넣어 CSS로 색을 입힌다
  // (css/oracle.css의 .qr-slot: 모듈 = 카드 금색 --qr-ink, 바탕 = 밝은 단색 --qr-paper). 모듈의 모양·위치·비율은 건드리지 않는다.
  var QR_DIR = 'assets/qr/';
  function qrImage(id) {
    id = Number(id);
    if (!(id >= 1 && id <= 28 && Math.floor(id) === id)) return null;
    return QR_DIR + 'qr_' + (id < 10 ? '0' : '') + id + '.svg';
  }
  var qrLoads = {};
  function loadQr(id) {
    var src = qrImage(id);
    if (!src) return Promise.reject(new Error('QR이 없는 별자리 ID: ' + id));
    if (!qrLoads[src]) {
      qrLoads[src] = fetch(src).then(function (res) {
        if (!res.ok) throw new Error(src + ' HTTP ' + res.status);
        return res.text();
      });
      qrLoads[src].catch(function () { delete qrLoads[src]; });
    }
    return qrLoads[src];
  }
  // slot 안에 그 별자리의 QR을 넣는다. 못 불러오면 비워 둔다 (다른 별자리의 QR이나 임의의 그림을 넣지 않음)
  function fillQr(slot, id) {
    if (!slot) return Promise.resolve(false);
    return loadQr(id).then(function (svgText) {
      var doc = new root.DOMParser().parseFromString(svgText, 'image/svg+xml');
      var svg = doc.documentElement;
      if (!svg || svg.nodeName.toLowerCase() !== 'svg' || doc.getElementsByTagName('parsererror').length) throw new Error('QR SVG를 읽지 못함');
      svg.removeAttribute('width');
      svg.removeAttribute('height');
      svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
      svg.setAttribute('role', 'img');
      svg.setAttribute('aria-label', '별 이야기 QR 코드');
      slot.textContent = '';
      slot.appendChild(document.importNode(svg, true));
      slot.setAttribute('data-qr-id', String(id));
      return true;
    }).catch(function (e) {
      console.error('[별운관 데이터] QR을 불러오지 못함:', id, e);
      slot.textContent = '';
      return false;
    });
  }

  // 카드가 등장하기 전에 미리 받아 둔다 (원본이 큰 JPG라 등장 순간에 받기 시작하면 늦을 수 있다)
  var preloaded = [];
  function preloadCards(visit) {
    if (!root.Image) return;
    [visit && cardImage(visit.mansionId), CARD_BACK].forEach(function (src) {
      if (!src || preloaded.some(function (i) { return i.src.slice(-src.length) === src; })) return;
      var img = new root.Image();
      img.src = src;
      preloaded.push(img);
    });
  }

  // ---------- 불러오기 (한 문서에서 한 번) ----------
  // cache: 'no-cache' → 브라우저 캐시를 쓰되 매번 서버에 바뀌었는지 묻는다(바뀌지 않았으면 304로 본문 없이 끝남).
  // 데이터를 고친 직후에도 옛 파일이 보이지 않고, 같은 파일을 다시 내려받지도 않는다.
  var loading = null;
  function fetchJson(name) {
    return fetch(DATA_DIR + name, { cache: 'no-cache' }).then(function (res) {
      if (!res.ok) throw new Error(name + ' HTTP ' + res.status);
      return res.json();
    });
  }
  function load() {
    if (loading) return loading;
    loading = fetchJson('manifest.json').then(function (manifest) {
      var f = manifest.files || {};
      ['reference', 'stories', 'descriptions', 'keywords'].forEach(function (k) { if (!text(f[k])) fail('manifest.files.' + k + ' 없음'); });
      return Promise.all([fetchJson(f.reference), fetchJson(f.stories), fetchJson(f.descriptions), fetchJson(f.keywords)]).then(function (r) {
        var db = buildDb({ manifest: manifest, reference: r[0], stories: r[1], descriptions: r[2], keywords: r[3] });
        console.info('[별운관 데이터] 불러옴: 별자리 28 · 별 이야기 ' + db.storyCount + '건 (' + f.stories + ')');
        return db;
      });
    });
    loading.catch(function (e) {
      console.error('[별운관 데이터] 불러오기 실패', e);
      loading = null;   // 다음에 다시 시도할 수 있게
    });
    return loading;
  }

  // 주소에 ?testDate=가 있으면 바로 저장해 둔다 (#1에서 지정해도 #6까지 이어지도록)
  if (root.location) testDate();

  return {
    CATEGORIES: CATEGORIES,
    FLOWS: FLOWS,
    PERIOD_LABEL: PERIOD_LABEL,
    YEAR_MIN: YEAR_MIN,
    YEAR_MAX: YEAR_MAX,
    MESSAGES: MESSAGES,
    VISIT_KEY: VISIT_KEY,
    load: load,
    buildDb: buildDb,
    mansionIdFor: mansionIdFor,
    resolveBirth: resolveBirth,
    leapMonthOf: function (year, Lunar) { var L = lunarClass(Lunar); return L ? leapMonthOf(L, year) : 0; },
    isValidSolar: isValidSolar,
    seoulDate: seoulDate,
    storyDate: storyDate,
    testDate: testDate,
    buildVisit: buildVisit,
    saveVisit: saveVisit,
    getVisit: getVisit,
    requireVisit: requireVisit,
    getStory: getStory,
    periodTitle: periodTitle,
    storyTitle: storyTitle,
    showVisitError: showVisitError,
    fillCard: fillCard,
    fillCardBack: fillCardBack,
    cardImage: cardImage,
    CARD_BACK: CARD_BACK,
    MANSION_KEYS: MANSION_KEYS,
    preloadCards: preloadCards,
    qrImage: qrImage,
    loadQr: loadQr,
    fillQr: fillQr,
  };
});

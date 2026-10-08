// 은은한 우주 배경(흐릿한 파티클, 연기 덩어리)과 입력 잠금 공용 헬퍼. 스타일은 oracle.css의 "은은한 우주 배경" 참고.
function ambientRand(min, max) {
  return min + Math.random() * (max - min);
}

// 흐릿한 파티클: container 안에(before 요소 앞에) count개 생성
function spawnHaze(container, count, before) {
  for (var i = 0; i < count; i++) {
    var p = document.createElement('div');
    p.className = 'haze-particle';
    var size = ambientRand(2, 12);
    p.style.width = size + 'px';
    p.style.height = size + 'px';
    p.style.left = ambientRand(0, 100) + '%';
    p.style.top = ambientRand(0, 100) + '%';
    p.style.filter = 'blur(' + size * 0.45 + 'px)';
    p.style.setProperty('--peak', ambientRand(0.12, 0.4).toFixed(2));
    p.style.setProperty('--dx', ambientRand(-40, 40) + 'px');
    p.style.setProperty('--dy', ambientRand(-70, -20) + 'px');
    p.style.animationDuration = ambientRand(6, 11) + 's';
    p.style.animationDelay = -ambientRand(0, 10) + 's';
    container.insertBefore(p, before || null);
  }
}

// 천천히 떠다니는 큰 연기 덩어리
function spawnSmoke(container, count, before) {
  for (var i = 0; i < count; i++) {
    var s = document.createElement('div');
    s.className = 'smoke';
    var size = ambientRand(380, 700);
    s.style.width = size + 'px';
    s.style.height = size + 'px';
    s.style.left = ambientRand(-10, 85) + '%';
    s.style.top = ambientRand(-15, 75) + '%';
    s.style.setProperty('--dx', ambientRand(-120, 120) + 'px');
    s.style.setProperty('--dy', ambientRand(-80, 80) + 'px');
    s.style.animationDuration = ambientRand(16, 26) + 's';
    s.style.animationDelay = -ambientRand(0, 16) + 's';
    container.insertBefore(s, before || null);
  }
}

// 스크린 연출 중 관람객 입력 잠금 (프로토타입용 테스트 도구 .dev-tools만 예외). unlockInput()으로 해제
var inputLocked = false;
var inputLockInstalled = false;
function lockInput() {
  inputLocked = true;
  document.documentElement.classList.add('input-locked');
  if (inputLockInstalled) return;
  inputLockInstalled = true;
  ['pointerdown', 'click', 'touchstart', 'contextmenu'].forEach(function (type) {
    document.addEventListener(type, function (e) {
      if (!inputLocked) return;
      if (e.target.closest && e.target.closest('.dev-tools')) return;
      e.preventDefault();
      e.stopPropagation();
    }, { passive: false, capture: true });
  });
}
function unlockInput() {
  inputLocked = false;
  document.documentElement.classList.remove('input-locked');
}

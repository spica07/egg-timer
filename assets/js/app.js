// 화면 전환, 기준 시간 관리, 화면 꺼짐 방지.
(() => {
  // 끓는 물에 넣은 뒤 삶는 시간. 냉장 보관한 보통 크기 계란 기준.
  const BASE_COOK = { soft: 420, hard: 720 };
  // 찬물부터 삶을 때 물이 끓기까지 잡아두는 시간. 화력에 따라 실제로는 다르므로
  // 삶는 화면의 "물이 끓기 시작했어요" 버튼으로 그 차이를 바로잡는다.
  const HEAT = 120;
  const NAME = { soft: '반숙', hard: '완숙' };
  const MIN_COOK = 60;
  const MAX_COOK = 1800;

  const LEDE = {
    boiling: '끓는 물에 계란을 넣고<br>어떻게 삶을지 누르세요',
    cold: '찬물에 계란을 넣고<br>불을 켤 때 누르세요'
  };
  const FOOTNOTE = {
    boiling: '냉장고에서 꺼낸 보통 크기 계란 기준이에요',
    cold: '화력과 냄비에 따라 끓는 시간이 달라요. 물이 끓으면 화면에서 눌러 주세요'
  };

  // ?test=1 을 붙이면 흐름 확인용 짧은 시간으로 바뀐다
  const testMode = new URLSearchParams(location.search).get('test') === '1';
  const TEST_COOK = { soft: 5, hard: 8 };
  const TEST_HEAT = 4;

  const pickScreen = document.getElementById('pickScreen');
  const runScreen = document.getElementById('runScreen');
  const doneScreen = document.getElementById('doneScreen');
  const runLabel = document.getElementById('runLabel');
  const countdown = document.getElementById('countdown');
  const doneTitle = document.getElementById('doneTitle');
  const wakeNote = document.getElementById('wakeNote');
  const boilBtn = document.getElementById('boilBtn');
  const lede = document.getElementById('lede');
  const footnote = document.getElementById('footnote');
  const softTime = document.getElementById('softTime');
  const hardTime = document.getElementById('hardTime');
  const resetBtn = document.getElementById('resetBtn');
  const shareBtn = document.getElementById('shareBtn');
  const shareToast = document.getElementById('shareToast');

  let water = 'boiling';   // 'boiling' | 'cold'
  let current = 'soft';    // 'soft' | 'hard'
  let cookMs = 0;          // 지금 돌고 있는 타이머의 삶는 시간(끓은 뒤 구간)
  let wakeLock = null;

  // ── 기준 시간 ────────────────────────────────────
  // 조절값은 "삶는 시간" 하나에만 붙는다. 찬물이든 끓는 물이든 같은 기준을 쓴다.

  function offsetKey(preset) { return `egg-timer:offset:${preset}`; }

  function readOffset(preset) {
    try { return Number(localStorage.getItem(offsetKey(preset))) || 0; }
    catch (e) { return 0; }
  }

  function writeOffset(preset, seconds) {
    try { localStorage.setItem(offsetKey(preset), String(seconds)); } catch (e) {}
  }

  function cookSeconds(preset) {
    if (testMode) return TEST_COOK[preset];
    return Math.min(MAX_COOK, Math.max(MIN_COOK, BASE_COOK[preset] + readOffset(preset)));
  }

  function heatSeconds() {
    return testMode ? TEST_HEAT : HEAT;
  }

  function totalSeconds(preset) {
    return cookSeconds(preset) + (water === 'cold' ? heatSeconds() : 0);
  }

  function isTuned() {
    return readOffset('soft') !== 0 || readOffset('hard') !== 0;
  }

  function resetTimes() {
    try {
      localStorage.removeItem(offsetKey('soft'));
      localStorage.removeItem(offsetKey('hard'));
    } catch (e) {}
    paintPickScreen();
    showToast(`기준 시간을 ${BASE_COOK.soft / 60}분과 ${BASE_COOK.hard / 60}분으로 되돌렸어요`);
  }

  function paintPickScreen() {
    softTime.textContent = Timer.format(totalSeconds('soft') * 1000);
    hardTime.textContent = Timer.format(totalSeconds('hard') * 1000);
    lede.innerHTML = LEDE[water];
    footnote.textContent = FOOTNOTE[water];
    resetBtn.hidden = testMode || !isTuned();
    document.querySelectorAll('.water-btn').forEach(b => {
      const on = b.dataset.water === water;
      b.classList.toggle('active', on);
      b.setAttribute('aria-pressed', String(on));
    });
  }

  // ── 화면 전환 ────────────────────────────────────

  function show(screen) {
    pickScreen.hidden = screen !== 'pick';
    runScreen.hidden = screen !== 'run';
    doneScreen.hidden = screen !== 'done';
  }

  // ── 화면 꺼짐 방지 ───────────────────────────────

  async function acquireWakeLock() {
    if (!('wakeLock' in navigator)) {
      wakeNote.hidden = false;
      return;
    }
    wakeNote.hidden = true;
    try {
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.addEventListener('release', () => { wakeLock = null; });
    } catch (e) {
      // 배터리 절약 모드 등으로 거절되면 안내로 대신한다
      wakeNote.hidden = false;
    }
  }

  function releaseWakeLock() {
    if (wakeLock) { try { wakeLock.release(); } catch (e) {} }
    wakeLock = null;
  }

  // ── 타이머 ───────────────────────────────────────

  const handlers = {
    onTick: (leftMs) => {
      countdown.textContent = Timer.format(leftMs);

      // 남은 시간이 삶는 시간보다 많으면 아직 물을 끓이는 중이다
      const heating = leftMs > cookMs;
      boilBtn.hidden = !heating;
      runLabel.textContent = heating
        ? `${NAME[current]} · 물 끓이는 중`
        : NAME[current];

      // 물이 끓기 전에는 계란이 익지 않는다
      Egg.render(cookMs ? (cookMs - leftMs) / cookMs : 0);
    },
    onFinish: () => finish()
  };

  function runTimer(seconds) {
    // 사용자 제스처 안에서 오디오를 열고 종료 시각의 알람음을 미리 예약한다
    Alarm.unlock();
    Alarm.schedule(seconds);
    Egg.bind();
    Timer.start(seconds, handlers);
  }

  function begin(preset) {
    current = preset;
    cookMs = cookSeconds(preset) * 1000;

    try {
      localStorage.setItem('egg-timer:preset', preset);
      localStorage.setItem('egg-timer:water', water);
    } catch (e) {}

    runTimer(totalSeconds(preset));
    show('run');
    acquireWakeLock();
  }

  // 물이 끓은 순간부터 삶는 시간을 다시 잡는다 — 화력 차이가 여기서 사라진다
  function boilNow() {
    if (!Timer.isRunning()) return;
    runTimer(cookMs / 1000);
  }

  function finish() {
    releaseWakeLock();
    doneTitle.textContent = `${NAME[current]} 다 됐어요`;
    document.body.classList.add('ringing');
    show('done');
    Alarm.ring();
  }

  function backToPick() {
    Timer.stop();
    Alarm.stop();
    releaseWakeLock();
    document.body.classList.remove('ringing');
    paintPickScreen();
    show('pick');
  }

  // ── 조작 ─────────────────────────────────────────

  document.querySelectorAll('.water-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      water = btn.dataset.water;
      paintPickScreen();
    });
  });

  document.querySelectorAll('.preset').forEach(btn => {
    btn.addEventListener('click', () => begin(btn.dataset.preset));
  });

  boilBtn.addEventListener('click', boilNow);
  resetBtn.addEventListener('click', resetTimes);
  document.getElementById('stopBtn').addEventListener('click', backToPick);
  document.getElementById('dismissBtn').addEventListener('click', backToPick);

  // 조절한 값은 다음 실행의 기준이 된다 — 고르는 화면 버튼에 그대로 나타난다
  function tune(delta) {
    if (!Timer.isRunning()) return;
    const before = Timer.remainingMs();
    const after = Timer.shift(delta);
    if (after === before) return;

    if (!testMode) {
      const next = Math.min(MAX_COOK, Math.max(MIN_COOK, cookSeconds(current) + delta));
      writeOffset(current, next - BASE_COOK[current]);
      cookMs = next * 1000;
    } else {
      cookMs += delta * 1000;
    }
    // 종료 시각이 바뀌었으니 예약된 알람음도 다시 잡는다
    Alarm.schedule(after / 1000);
  }

  document.getElementById('minusBtn').addEventListener('click', () => tune(-30));
  document.getElementById('plusBtn').addEventListener('click', () => tune(30));

  // 화면이 가려지면 OS가 wake lock을 회수하므로 돌아올 때 다시 얻는다
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    if (!Timer.isRunning()) return;
    countdown.textContent = Timer.format(Timer.remainingMs());
    if (!wakeLock) acquireWakeLock();
  });

  // ── 공유 ─────────────────────────────────────────

  function showToast(message) {
    shareToast.textContent = message;
    shareToast.hidden = false;
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => { shareToast.hidden = true; }, 2400);
  }

  shareBtn.addEventListener('click', async () => {
    const url = location.href;
    if (navigator.share) {
      try { await navigator.share({ title: document.title, url }); } catch (e) {}
      return;
    }
    try {
      await navigator.clipboard.writeText(url);
      showToast('링크를 복사했어요');
    } catch (e) {
      window.prompt('아래 링크를 복사하세요', url);
    }
  });

  // ── 첫 진입 ──────────────────────────────────────

  paintPickScreen();

  // 앱을 닫았다 다시 열었을 때 아직 삶는 중이면 이어서 보여준다.
  // 이때는 사용자 제스처가 없어 알람음을 미리 예약할 수 없고, 종료 시점에 직접 재생한다.
  const saved = Timer.readSaved();
  if (saved && saved.endAt > Date.now()) {
    try {
      const p = localStorage.getItem('egg-timer:preset');
      if (NAME[p]) current = p;
      const w = localStorage.getItem('egg-timer:water');
      if (LEDE[w]) water = w;
    } catch (e) {}
    cookMs = cookSeconds(current) * 1000;
    Egg.bind();
    show('run');
    Timer.resume(saved.endAt, saved.totalMs, handlers);
    acquireWakeLock();
  } else {
    Timer.clearSaved();
    show('pick');
  }

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js').catch(() => {});
    });
  }
})();

// 알람 — 소리와 진동.
//
// 소리를 확실히 울리는 게 이 앱의 핵심이라 두 갈래로 만든다.
//   1) 타이머를 시작하는 순간(사용자 제스처) AudioContext를 만들고, 종료 시각에 울릴
//      비프음을 오디오 그래프에 미리 예약한다. 오디오 클럭은 JS 타이머와 별도로 흐르므로
//      탭이 백그라운드로 밀려 setInterval이 스로틀링돼도 소리가 난다.
//   2) 예약이 살아있지 않은 경우(컨텍스트가 정지됐거나 만들지 못한 경우)에만
//      종료 시점에 setInterval로 직접 재생한다. 둘이 겹쳐 울리지 않게 한다.
const Alarm = (() => {
  const BEEP_HZ = 880;
  const BEEP_LEN = 0.18;   // 비프 한 번의 길이(초)
  const BEEP_GAP = 0.22;   // 비프 시작 간격(초)
  const CYCLE = 1.6;       // "삐-삐-삐" 한 묶음의 주기(초)
  const CYCLES = 40;       // 약 64초간 울린 뒤 스스로 멈춘다
  const VIBRATE_PATTERN = [400, 180, 400, 180, 400];

  let ctx = null;
  let scheduled = [];      // 예약된 오실레이터 — 알람을 끌 때 정리해야 한다
  let scheduleReady = false;
  let loopId = null;
  let vibrateId = null;

  // 사용자 제스처 안에서 불러야 한다. 모바일 브라우저는 제스처 없이 만든
  // 컨텍스트를 재생 금지 상태로 두기 때문이다.
  function unlock() {
    try {
      if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
      if (ctx.state === 'suspended') ctx.resume();
    } catch (e) {
      ctx = null;
    }
    return ctx;
  }

  function beepAt(startAt) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = BEEP_HZ;
    gain.gain.setValueAtTime(0.0001, startAt);
    gain.gain.exponentialRampToValueAtTime(0.3, startAt + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, startAt + BEEP_LEN);
    osc.connect(gain).connect(ctx.destination);
    osc.start(startAt);
    osc.stop(startAt + BEEP_LEN + 0.02);
    scheduled.push(osc);
  }

  // delaySeconds 뒤부터 알람음을 오디오 그래프에 예약한다
  function schedule(delaySeconds) {
    clearSchedule();
    if (!unlock()) return false;
    const base = ctx.currentTime + Math.max(0, delaySeconds);
    for (let c = 0; c < CYCLES; c++) {
      const cycleStart = base + c * CYCLE;
      for (let b = 0; b < 3; b++) beepAt(cycleStart + b * BEEP_GAP);
    }
    scheduleReady = true;
    return true;
  }

  function clearSchedule() {
    scheduled.forEach(osc => { try { osc.stop(); } catch (e) {} });
    scheduled = [];
    scheduleReady = false;
  }

  // 예약이 살아있으면 소리는 그쪽에 맡기고 진동만 담당한다
  function ring() {
    const scheduleAlive = scheduleReady && ctx && ctx.state === 'running';
    if (!scheduleAlive) {
      clearSchedule();
      if (unlock()) {
        playCycleNow();
        loopId = setInterval(playCycleNow, CYCLE * 1000);
      }
    }
    startVibrate();
  }

  function playCycleNow() {
    if (!ctx) return;
    const now = ctx.currentTime;
    for (let b = 0; b < 3; b++) beepAt(now + 0.01 + b * BEEP_GAP);
  }

  function startVibrate() {
    if (!('vibrate' in navigator)) return;
    const buzz = () => { try { navigator.vibrate(VIBRATE_PATTERN); } catch (e) {} };
    buzz();
    vibrateId = setInterval(buzz, CYCLE * 1000);
  }

  function stop() {
    clearSchedule();
    if (loopId) clearInterval(loopId);
    loopId = null;
    if (vibrateId) clearInterval(vibrateId);
    vibrateId = null;
    if ('vibrate' in navigator) { try { navigator.vibrate(0); } catch (e) {} }
  }

  return { unlock, schedule, ring, stop };
})();

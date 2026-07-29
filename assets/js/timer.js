// 카운트다운 엔진 — 남은 초를 감산하지 않고 절대 종료 시각에서 매번 다시 계산한다.
// 백그라운드 탭에서 setInterval이 스로틀링돼도 시간이 어긋나지 않는다.
const Timer = (() => {
  const TICK_MS = 250;
  const STORE_KEY = 'egg-timer:running';

  let endAt = 0;
  let totalMs = 0;
  let intervalId = null;
  let finished = false;
  let onTick = null;
  let onFinish = null;

  function remainingMs() {
    return Math.max(0, endAt - Date.now());
  }

  function elapsedRatio() {
    if (!totalMs) return 0;
    return Math.min(1, (totalMs - remainingMs()) / totalMs);
  }

  function evaluate() {
    const left = remainingMs();
    if (onTick) onTick(left, elapsedRatio());
    if (left <= 0 && !finished) {
      finished = true;
      clearInterval(intervalId);
      intervalId = null;
      clearSaved();
      if (onFinish) onFinish();
    }
  }

  function start(seconds, handlers) {
    stop();
    totalMs = seconds * 1000;
    endAt = Date.now() + totalMs;
    finished = false;
    onTick = handlers.onTick;
    onFinish = handlers.onFinish;
    save();
    evaluate();
    intervalId = setInterval(evaluate, TICK_MS);
  }

  // 화면 복귀·재진입 시 저장된 타이머를 이어받는다
  function resume(savedEndAt, savedTotalMs, handlers) {
    stop();
    endAt = savedEndAt;
    totalMs = savedTotalMs;
    finished = false;
    onTick = handlers.onTick;
    onFinish = handlers.onFinish;
    evaluate();
    if (!finished) intervalId = setInterval(evaluate, TICK_MS);
  }

  function stop() {
    if (intervalId) clearInterval(intervalId);
    intervalId = null;
    finished = false;
    clearSaved();
  }

  // 조절 버튼 — 종료 시각과 전체 길이를 함께 옮겨 진행률이 튀지 않게 한다
  function shift(deltaSeconds) {
    if (!intervalId) return remainingMs();
    const delta = deltaSeconds * 1000;
    // 남은 시간이 0 아래로 내려가지 않게 막는다
    const nextLeft = remainingMs() + delta;
    if (nextLeft < 1000) return remainingMs();
    endAt += delta;
    totalMs += delta;
    save();
    evaluate();
    return remainingMs();
  }

  function isRunning() {
    return intervalId !== null;
  }

  function save() {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify({ endAt, totalMs }));
    } catch (e) { /* 시크릿 모드 등에서 저장이 막히면 무시한다 */ }
  }

  function clearSaved() {
    try { localStorage.removeItem(STORE_KEY); } catch (e) {}
  }

  function readSaved() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (!raw) return null;
      const data = JSON.parse(raw);
      if (!data || !data.endAt || !data.totalMs) return null;
      return data;
    } catch (e) { return null; }
  }

  function format(ms) {
    const total = Math.ceil(ms / 1000);
    const m = Math.floor(total / 60);
    const s = total % 60;
    return `${m}:${String(s).padStart(2, '0')}`;
  }

  return { start, resume, stop, shift, isRunning, remainingMs, readSaved, clearSaved, format };
})();

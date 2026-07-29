// 계란 단면 렌더링 — 진행률을 "익은 정도"로 보여준다.
// 계란은 겉에서 안으로 익으므로 생노른자 원의 반지름을 줄여 익은 노른자를 드러낸다.
// 흰자는 노른자보다 훨씬 빨리 굳으므로 앞쪽 25% 구간에서 불투명해진다.
const Egg = (() => {
  const YOLK_R = 47;      // index.html의 .yolk-set 반지름과 같아야 한다
  const WHITE_SET_AT = 0.25; // 흰자가 다 굳는 시점(진행률)

  let white = null, yolkRaw = null, gloss = null;

  function bind() {
    white = document.getElementById('eggWhite');
    yolkRaw = document.getElementById('yolkRaw');
    gloss = document.getElementById('yolkGloss');
  }

  // progress: 0(막 넣은 상태) → 1(다 익은 상태)
  function render(progress) {
    if (!white) bind();
    const p = Math.min(1, Math.max(0, progress));

    const rawR = YOLK_R * (1 - p);
    yolkRaw.setAttribute('r', rawR.toFixed(2));

    // 광택은 생노른자에만 있다. 생노른자가 작아지면 함께 사라진다.
    const glossOn = rawR > 16;
    gloss.style.opacity = glossOn ? String(Math.min(1, rawR / YOLK_R)) : '0';

    const whiteOpacity = 0.42 + 0.58 * Math.min(1, p / WHITE_SET_AT);
    white.style.opacity = whiteOpacity.toFixed(3);
  }

  return { render, bind };
})();

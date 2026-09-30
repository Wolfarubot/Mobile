/**
 * Full-screen story cutscenes: a sequence of panels (a big piece of art and a line of text typed out).
 * Tap to finish the line or go on; Skip ends it. Calls `done` when it closes.
 */
export interface CutscenePanel {
  art: string;
  text: string;
}

/** The Hunters' attempt to kill the Time Eater, played when it's driven down to half HP. */
export const TIME_EATER_CUTSCENE: CutscenePanel[] = [
  { art: '⏳', text: 'The Time Eater reels. Half of its vast body tears away and scatters into the Rift.' },
  { art: '⚔️', text: 'The Hunters press in with everything they have left: blades, arrows and spells.' },
  { art: '🌀', text: 'Then the hours run backward. Wounds close. Arrows fly back into their quivers.' },
  { art: '⏳', text: 'It is swallowing time itself: the moment it was struck, and every moment after.' },
  { art: '💥', text: 'It cannot be killed. Not like this. But it can be hurt, and now it knows it.' },
  { art: '🌌', text: 'With a scream that bends the stars, the Time Eater flees into the deepest dark of the Rift.' },
  { art: '🏹', text: 'The Void Rift is yours, for now. Somewhere beyond it, the Time Eater is waiting.' },
];

const TYPE_MS = 28;

export function playCutscene(panels: CutscenePanel[], done: () => void = () => {}): void {
  const view = document.createElement('div');
  view.className = 'cutscene';
  view.innerHTML = `
    <div class="cs-stars">${Array.from({ length: 28 }, (_, i) => `<i style="left:${(i * 37) % 100}%;top:${(i * 53) % 100}%;animation-delay:${(i % 7) * 0.4}s"></i>`).join('')}</div>
    <button class="cs-skip">Skip ›</button>
    <div class="cs-art"></div>
    <div class="cs-box"><p class="cs-text"></p><small class="cs-hint">Tap to continue</small></div>
    <div class="cs-dots">${panels.map(() => '<b></b>').join('')}</div>`;
  document.body.appendChild(view);
  const art = view.querySelector<HTMLElement>('.cs-art')!;
  const text = view.querySelector<HTMLElement>('.cs-text')!;
  const dots = Array.from(view.querySelectorAll<HTMLElement>('.cs-dots b'));
  let i = -1;
  let timer = 0;
  let typing = false;

  const close = () => {
    clearInterval(timer);
    view.classList.add('out');
    setTimeout(() => view.remove(), 350);
    done();
  };
  const show = (n: number) => {
    i = n;
    const p = panels[i];
    art.textContent = p.art;
    art.classList.remove('in');
    void art.offsetWidth; // restart the entrance animation
    art.classList.add('in');
    dots.forEach((d, k) => d.classList.toggle('on', k <= i));
    // Type the line out a character at a time.
    let shown = 0;
    text.textContent = '';
    typing = true;
    clearInterval(timer);
    timer = window.setInterval(() => {
      shown++;
      text.textContent = p.text.slice(0, shown);
      if (shown >= p.text.length) {
        clearInterval(timer);
        typing = false;
      }
    }, TYPE_MS);
  };
  view.addEventListener('click', (e) => {
    if ((e.target as HTMLElement).closest('.cs-skip')) return close();
    if (typing) {
      clearInterval(timer);
      text.textContent = panels[i].text;
      typing = false;
    } else if (i + 1 < panels.length) show(i + 1);
    else close();
  });
  show(0);
}

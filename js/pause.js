// Pause for local play: either player stops both clocks, the board and the racks are hidden (so a pause cannot be used to plan a move for free), and a full-screen card
// says so until someone resumes. Press a player's clock, or the P key; Settings has a button too. Online play has its own pause (js/online/session.js), same card.
import { $, S, app } from './state.js';
import { tick } from './game.js';
import { showOv, hideOv, setOvTime, ovKind } from './overlay.js';
import { nameIso } from './names.js';
import { haptic } from './haptics.js';
import { notice } from './ui.js';

let t0 = 0, timer = 0;
export const mmss = ms => { const s = Math.max(0, Math.round(ms / 1000)); return `${s / 60 | 0}:${String(s % 60).padStart(2, '0')}`; };
const busy = () => !!document.querySelector('dialog[open]') || !!S.pending;

export function pauseGame() {
  if (app.net || !S.board || S.ended || S.hold || busy() || ovKind()) return;
  tick(); if (S.ended) return;   // time may have run out this very moment
  S.hold = true; t0 = performance.now();
  document.documentElement.dataset.paused = 'true';
  const draw = () => showOv({
    kind: 'pause', icon: 'pause', title: 'اللعبة متوقفة مؤقتًا',
    lines: [`الساعتان متوقفتان · الدور على ${nameIso(S.cur)}`, 'اللوح والرفوف مخفية حتى الاستئناف.'],
    time: `مدة الإيقاف ${mmss(performance.now() - t0)}`,
    actions: [{ id: 'resume', primary: true, label: 'استئناف اللعب', onClick: resumeGame }]
  });
  draw(); clearInterval(timer); timer = setInterval(() => setOvTime(`مدة الإيقاف ${mmss(performance.now() - t0)}`), 500);
  haptic('tick');
}
export function resumeGame() {
  if (!S.hold) return;
  clearInterval(timer); S.hold = false; S.last = performance.now();   // the time spent paused is never charged
  delete document.documentElement.dataset.paused;
  hideOv('pause'); notice('استُؤنفت اللعبة'); haptic('tick');
}
// Clocks become pause buttons in local play only.
export function clockButtons(on) {
  for (const i of [0, 1]) {
    const el = document.getElementById('t' + i); if (!el) continue;
    if (on) { el.setAttribute('role', 'button'); el.tabIndex = 0; el.setAttribute('aria-label', 'إيقاف اللعبة مؤقتًا'); el.title = 'إيقاف مؤقت (P)'; }
    else { el.removeAttribute('role'); el.removeAttribute('tabindex'); el.removeAttribute('aria-label'); el.removeAttribute('title'); }
  }
  document.documentElement.toggleAttribute('data-clockpause', on);
}
export function initPause() {
  clockButtons(true);
  $('#players').addEventListener('click', e => { if (e.target.closest('.ptime')) pauseGame(); });
  $('#players').addEventListener('keydown', e => { if ((e.key === 'Enter' || e.key === ' ') && e.target.closest?.('.ptime')) { e.preventDefault(); pauseGame(); } });
  document.addEventListener('keydown', e => {
    if ((e.key !== 'p' && e.key !== 'P') || e.ctrlKey || e.metaKey || e.altKey || e.repeat) return;
    if (e.target.closest?.('input,textarea,select,[contenteditable="true"]')) return;
    pauseGame();
  });
  // A dedicated button in the button rack (Game Tools while the workspace is ON). It lives in the controls, not in a player's panel, so resizing a rack or a panel can never move it.
  const pb = document.getElementById('bPause'); if (pb) pb.onclick = pauseGame;
  const b = document.getElementById('pauseNow');
  if (b) b.onclick = () => { document.getElementById('aClose')?.click(); setTimeout(pauseGame, 0); };
}

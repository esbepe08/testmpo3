// The Tahkim discussion window (online). One non-modal panel, the same session on both screens: the reason, a chat, each player's selected verdict, and a rules reference.
// It draws what the server's snapshot says (game.tahkim: reason, words, votes, chat) and sends two kinds of request through the handlers it is given (a message, a verdict).
// It decides nothing: a verdict only counts when the server has seen both players choose the same one, and the server alone resolves it.
// Per-device interface state (never sent): minimized or not, the rules panel open or not and which categories are open, the verdict I have picked but not yet confirmed, my unsent text.
import { tahkimRulesHtml } from '../tahkim-rules.js';

const VERDICT = { valid: '✔ صحيح', invalid: '✖ خطأ' };
const MINKEY = 'eas.tk.min';
const $ = s => document.querySelector(s);
const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };
const hhmm = t => { try { return new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); } catch { return ''; } };

const ui = { built: false, sig: '', key: '', minimized: false, rules: false, pick: null, pickKey: '', unread: 0, seen: 0, sending: false, voting: false, h: null, rulesMode: '' };

function build() {
  if (ui.built) return; ui.built = true;
  const p = el('section', 'tkPanel'); p.id = 'tkPanel'; p.hidden = true; p.setAttribute('role', 'dialog'); p.setAttribute('aria-labelledby', 'tkTitle'); p.setAttribute('aria-modal', 'false');
  p.innerHTML = `<header class="tkHead"><div class="tkHeadT"><h2 id="tkTitle" tabindex="-1">التحكيم</h2><div id="tkWords" class="tkWords"></div></div>`
    + `<button type="button" id="tkRulesBtn" class="btn tkHb" aria-expanded="false" aria-controls="tkRulesBox">القواعد</button>`
    + `<button type="button" id="tkMinBtn" class="btn tkHb" aria-label="تصغير نافذة التحكيم (يبقى التحكيم قائمًا)" title="تصغير">−</button></header>`
    + `<div id="tkRulesBox" class="tkRulesBox" hidden></div>`
    + `<div id="tkWhy" class="tkWhy2"></div>`
    + `<div id="tkLog" class="tkLog" role="log" aria-live="polite" aria-label="محادثة التحكيم"></div>`
    + `<div class="tkVerdict"><div id="tkChips" class="tkChips"></div><div id="tkStatus" class="tkStatus" role="status"></div>`
    + `<div class="tkActs" role="group" aria-label="اختيار الحكم"><button type="button" class="btn yes tkPick" data-v="valid" aria-pressed="false">✔ صحيح</button><button type="button" class="btn danger tkPick" data-v="invalid" aria-pressed="false">✖ خطأ</button>`
    + `<button type="button" id="tkConfirm" class="btn main tkConfirm"></button><button type="button" id="tkWithdraw" class="btn tkWd">سحب اختياري</button></div></div>`
    + `<form id="tkForm" class="tkComposer" autocomplete="off"><label class="vh" for="tkText">رسالة</label><textarea id="tkText" rows="1" maxlength="300" placeholder="اكتب رسالتك…" enterkeyhint="send"></textarea><button type="submit" class="btn main" id="tkSend">إرسال</button></form>`;
  const m = el('button', 'btn tkMini'); m.id = 'tkMini'; m.type = 'button'; m.hidden = true;
  document.body.append(p, m);
  m.onclick = () => setMin(false);
  $('#tkMinBtn').onclick = () => setMin(true);
  $('#tkRulesBtn').onclick = () => setRules(!ui.rules);
  p.addEventListener('keydown', e => { if (e.key === 'Escape') { e.preventDefault(); setMin(true); } });
  p.addEventListener('click', e => {
    const b = e.target.closest('.tkPick'); if (b) { ui.pick = b.dataset.v; ui.pickKey = ui.key; paint(); return; }
  });
  $('#tkConfirm').onclick = () => vote(ui.pick);
  $('#tkWithdraw').onclick = () => { ui.pick = null; vote(null); };
  const ta = $('#tkText');
  ta.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); $('#tkForm').requestSubmit(); } });
  ta.addEventListener('input', () => { ta.style.height = 'auto'; ta.style.height = Math.min(ta.scrollHeight, 96) + 'px'; });
  $('#tkForm').addEventListener('submit', async e => {
    e.preventDefault(); const text = ta.value.replace(/\s+/g, ' ').trim(); if (!text || ui.sending) return;
    ui.sending = true; paint();
    const ok = await ui.h.send(text);   // the text stays in the box until the server has it: a failed send loses nothing
    ui.sending = false; if (ok) { ta.value = ''; ta.style.height = 'auto'; } paint(); ta.focus({ preventScroll: true });
  });
}
async function vote(v) { if (ui.voting) return; ui.voting = true; paint(); try { await ui.h.vote(v); } finally { ui.voting = false; paint(); } }
function setRules(on) {
  ui.rules = on; const box = $('#tkRulesBox'), b = $('#tkRulesBtn');
  if (on && ui.rulesMode !== ui.mode) { box.innerHTML = tahkimRulesHtml(ui.mode); ui.rulesMode = ui.mode; }
  box.hidden = !on; b.setAttribute('aria-expanded', String(on)); $('#tkPanel').classList.toggle('rulesOn', on);
}
function setMin(min) {
  ui.minimized = min; try { sessionStorage.setItem(MINKEY, min ? ui.key : ''); } catch { /* storage unavailable */ }
  if (!min) { ui.unread = 0; ui.seen = ui.chatN || 0; }
  paint();
  if (!min) { const log = $('#tkLog'); log.scrollTop = log.scrollHeight; $('#tkPanel').focus?.(); $('#tkText').focus({ preventScroll: true }); }
}

let snap = null, ctx = null;
// Called with every snapshot (and after local interface changes). ctx: { seat, names: [n0, n1], mode, handlers: { send(text), vote(verdict) } }
export function updateTahkim(s, c) {
  const g = s.game, open = g.status === 'tahkim_pending' && g.tahkim && g.tahkim.state === 'pending';
  if (!open) return hideTahkim();
  build(); snap = s; ctx = c; ui.h = c.handlers; ui.mode = c.mode;
  const key = g.id + ':' + g.round + ':' + g.tahkim.move_number, fresh = key !== ui.key;
  if (fresh) { ui.key = key; ui.pick = null; ui.unread = 0; ui.seen = 0; ui.sig = ''; ui.rulesMode = ''; try { ui.minimized = sessionStorage.getItem(MINKEY) === key; } catch { ui.minimized = false; } setRules(false); }
  const chat = g.tahkim.chat || [];
  ui.chatN = chat.length;
  if (ui.minimized) ui.unread = chat.filter(m => m.n > (ui.lastSeenN || 0) && m.s !== s.me.seat).length; else { ui.unread = 0; }
  if (!ui.minimized) ui.lastSeenN = chat.length ? chat[chat.length - 1].n : 0;
  paint(fresh);
  return fresh && !ui.minimized;
}
export function hideTahkim() {
  snap = null; ctx = null;   // a request still in flight must not repaint (and re-show) the window with the old state when it finishes
  if (!ui.built) return;
  const p = $('#tkPanel'); if (p.hidden && $('#tkMini').hidden) return;
  p.hidden = true; $('#tkMini').hidden = true; ui.key = ''; ui.minimized = false; ui.lastSeenN = 0; ui.sig = '';
  try { sessionStorage.removeItem(MINKEY); } catch { /* storage unavailable */ }
  document.documentElement.removeAttribute('data-tkopen');
}
export function reopenTahkim() { if (ui.built && ui.key) setMin(false); }
export const tahkimOpen = () => ui.built && !!ui.key;

function paint() {
  if (!snap || !ctx || !ui.built) return;
  const g = snap.game, t = g.tahkim, me = snap.me.seat, opp = 1 - me, N = ctx.names, chat = t.chat || [], votes = t.votes || [null, null];
  const p = $('#tkPanel'), mini = $('#tkMini');
  if (p.hidden !== ui.minimized) p.hidden = ui.minimized;
  mini.hidden = !ui.minimized;
  document.documentElement.toggleAttribute('data-tkopen', !ui.minimized);
  if (ui.minimized) { mini.textContent = ui.unread ? `التحكيم قائم · ${ui.unread} رسالة جديدة` : 'التحكيم قائم · فتح'; mini.classList.toggle('new', !!ui.unread); return; }
  // header: the disputed word(s)
  const words = (t.words || []).join(' · '); const wEl = $('#tkWords'); if (wEl.textContent !== words) wEl.textContent = words;
  $('#tkTitle').textContent = `تحكيم الحركة ${t.move_number}`;
  // the reason (public, set by the challenger)
  const why = $('#tkWhy'), whyT = `${N[t.challenger_seat]}: «${t.reason}»`; if (why.textContent !== 'سبب التحكيم · ' + whyT) why.textContent = 'سبب التحكيم · ' + whyT;
  // chat: rebuilt only when it changed (a message arriving never touches the text box or the verdict buttons)
  const sig = chat.map(m => m.n).join(',') + '|' + N.join('|'), log = $('#tkLog');
  if (sig !== ui.sig) {
    const near = log.scrollHeight - log.scrollTop - log.clientHeight < 60 || !ui.sig; ui.sig = sig;
    log.replaceChildren(...(chat.length ? chat.map(m => {
      const b = el('div', 'tkMsg' + (m.s === me ? ' mine' : '')); b.dataset.n = m.n;
      b.append(el('span', 'tkWho', N[m.s]), el('span', 'tkTxt', m.t), el('span', 'tkAt', hhmm(m.at)));
      return b;
    }) : [el('p', 'tkEmpty', 'لا رسائل بعد. ناقشا الكلمة هنا؛ لا يوجد حدّ زمني، والساعتان متوقفتان.')]));
    if (near) log.scrollTop = log.scrollHeight;
  }
  // selections (both visible: the discussion is open, and a match resolves at once)
  const chips = $('#tkChips'), cs = [me, opp].map(s => `${s === me ? 'أنت' : N[s]}: ${votes[s] ? VERDICT[votes[s]] : 'لم يختر بعد'}`).join(' ، ');
  if (chips.textContent !== cs) chips.textContent = cs;
  const mine = votes[me], theirs = votes[opp];
  if (ui.pickKey !== ui.key) ui.pick = mine;   // a pick not yet confirmed belongs to this session; otherwise mirror the server
  if (ui.pick == null && mine) ui.pick = mine;
  const msg = mine && theirs ? 'اختلف اختياركما: تابعا النقاش، ويمكن لكلٍّ منكما تغيير اختياره.'
    : mine ? `اخترتَ ${VERDICT[mine]} — بانتظار اختيار ${N[opp]}. لا يُحسم التحكيم إلا إذا اختار الاثنان الحكم نفسه.`
    : theirs ? `${N[opp]} اختار ${VERDICT[theirs]}. اختر حكمك ثم أكّده.`
    : 'اختر حكمك ثم أكّده. لا يُحسم التحكيم إلا إذا اختار اللاعبان الحكم نفسه.';
  const st = $('#tkStatus'); if (st.textContent !== msg) st.textContent = msg;
  for (const b of p.querySelectorAll('.tkPick')) { const on = ui.pick === b.dataset.v; if (b.getAttribute('aria-pressed') !== String(on)) b.setAttribute('aria-pressed', String(on)); b.disabled = ui.voting; }
  const cf = $('#tkConfirm'), changed = ui.pick && ui.pick !== mine;
  const label = !ui.pick ? 'اختر حكمًا أولًا' : changed ? `تأكيد: ${VERDICT[ui.pick]}` : 'تم التأكيد ✔';
  if (cf.textContent !== label) cf.textContent = label; cf.disabled = !changed || ui.voting;
  const wd = $('#tkWithdraw'); wd.hidden = !mine; wd.disabled = ui.voting;
  $('#tkSend').disabled = ui.sending; $('#tkText').readOnly = ui.sending;
}

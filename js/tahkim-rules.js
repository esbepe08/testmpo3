// Rules reference for the Tahkim discussion: an accordion of five categories, every number taken from the SAME constants the game engine uses (config.js, modes.js),
// so what a player reads here cannot drift from what the server enforces. Word rules come from wordrules.js (the document both players agreed on).
// Each player opens and closes their own panel and categories; nothing here is shared or sent anywhere.
import { BINGO, RACK, MIN_BAG_SWAP, PENALTY, INCREMENT_MS, TIME_BONUS_PER_MIN, PAUSES_EACH, PAUSE_MS, LABEL, CENTER } from './config.js';
import { TILE_MODES } from './modes.js';
import { OK, NO, CHECK, L, EX } from './wordrules.js';

const li = (ar, id) => id ? L(ar, id) : `<li><span class="wrAr" lang="ar">${ar}</span></li>`;
const ul = (rows, cls = '') => `<ul class="wrList ${cls}">${rows.map(r => li(...r)).join('')}</ul>`;
const min = ms => Math.round(ms / 60000);

const turn = () => [
  ['تُوضع القطع في صف واحد أو عمود واحد دون فجوات بينها.', 'Tile diletakkan dalam satu baris atau satu kolom tanpa celah.'],
  ['الحركة الأولى تغطي مربع «نجمة» في وسط اللوح.', 'Langkah pertama harus menutup kotak bintang di tengah papan.'],
  ['كل حركة بعد الأولى تتصل بقطع موجودة على اللوح، وتكوّن كلمة من حرفين فأكثر.', 'Setiap langkah berikutnya harus menyambung ke tile di papan dan membentuk kata minimal 2 huruf.'],
  [`التمرير والتبديل غير محدودين ولا ينهيان اللعبة. التبديل يحتاج ${MIN_BAG_SWAP} قطع على الأقل في الكيس.`, `Pass dan tukar tile tidak dibatasi. Menukar butuh minimal ${MIN_BAG_SWAP} tile di kantong.`],
  ['تبدأ الساعة بعد أول حركة. يبدأ اللعب بسحب قطعة لكل لاعب: الأعلى قيمةً يبدأ.', 'Jam mulai setelah langkah pertama. Pemain pertama ditentukan dengan menarik satu tile: nilai tertinggi mulai.'],
  [`ساعة الشطرنج: تُضاف ${INCREMENT_MS / 1000} ثوانٍ بعد كل حركة تضع فيها قطعًا. لا تُضاف عند التمرير أو التبديل أو إبطال الحركة.`, `Jam catur: +${INCREMENT_MS / 1000} detik setiap langkah yang menaruh tile (tidak untuk pass, tukar, atau langkah yang dibatalkan).`],
  [`التحكيم يطلبه اللاعب صاحب الدور على آخر حركة لخصمه. «صحيح»: تبقى الحركة ويدفع صاحب الطلب غرامة ${PENALTY} نقاط (أو نقاطه إن كانت أقل). «خطأ»: تُلغى الحركة وتعود القطع واللوح والنقاط، ويأخذ صاحب الطلب الدور.`, `Tahkim diajukan pemain yang sedang giliran atas langkah terakhir lawan. «صحيح»: langkah tetap, penantang kena denda ${PENALTY} poin (atau sisa poinnya). «خطأ»: langkah batal, papan/tile/poin kembali, penantang mendapat giliran.`],
  [`الإيقاف المؤقت عبر الإنترنت: ${PAUSES_EACH} لكل لاعب، ${min(PAUSE_MS)} دقائق كحد أقصى. أثناء التحكيم تتوقف الساعتان تلقائيًا بلا حد زمني.`, `Jeda online: ${PAUSES_EACH} kali per pemain, maksimal ${min(PAUSE_MS)} menit. Selama Tahkim kedua jam otomatis berhenti tanpa batas waktu.`],
  ['الاستسلام: تصبح نقاط المستسلم صفرًا فورًا ويفوز خصمه تلقائيًا.', 'Menyerah: skor penyerah langsung 0 dan lawan menang otomatis.']
];

const scoring = () => [
  [`مربعات اللوح: ${LABEL[1]} (ضعف قيمة الحرف) · ${LABEL[2]} (ثلاثة أضعاف) · ${LABEL[3]} (ضعف الكلمة) · ${LABEL[4]} (ثلاثة أضعاف الكلمة). نجمة الوسط تضاعف الكلمة.`, 'Kotak bonus: huruf ×2 / ×3, kata ×2 / ×3. Bintang tengah menggandakan kata.'],
  ['لا تُحتسب المربعات المميزة إلا للقطع الموضوعة في هذه الحركة، وتُحسب كل كلمة تتكوّن (أفقية ورأسية).', 'Bonus hanya untuk tile yang baru diletakkan; setiap kata yang terbentuk (mendatar dan menurun) dihitung.'],
  ['القطعة الفارغة قيمتها صفر دائمًا، وتأخذ الحرف الذي يختاره اللاعب.', 'Tile kosong selalu bernilai 0 dan mewakili huruf pilihan pemain.'],
  [`وضع القطع السبع كلها في حركة واحدة يمنح +${BINGO} نقطة.`, `Menaruh ketujuh tile sekaligus memberi +${BINGO} poin.`],
  [`النتيجة النهائية = النقاط + (الدقائق المتبقية × ${TIME_BONUS_PER_MIN}) − قيمة القطع المتبقية على الرف. تُقرَّب الدقائق إلى الأقرب، ونصف الدقيقة للأسفل.`, `Skor akhir = poin + (menit tersisa × ${TIME_BONUS_PER_MIN}) − nilai tile di rak. Menit dibulatkan; tepat 30 detik dibulatkan ke bawah.`],
  [`غرامة التحكيم الخاسر للتحدي: ${PENALTY} نقاط.`, `Denda tantangan yang gagal: ${PENALTY} poin.`]
];

const tilesTable = id => {
  const m = TILE_MODES[id] || Object.values(TILE_MODES)[0], by = {};
  for (const [l, v, n] of m.tiles) (by[v] ||= []).push(l ? `${l}×${n}` : `فارغة×${n}`);
  const rows = Object.keys(by).map(Number).sort((a, b) => a - b).map(v => `<li><b class="num">${v}</b> <span lang="ar">${by[v].join(' · ')}</span></li>`).join('');
  return `<p class="wrNote"><span lang="ar">${m.labelAr}: توزيع القطع (القيمة ← الحروف × العدد)</span></p><ul class="wrList tkTiles">${rows}</ul>`;
};
const letters = id => [
  [`لكل لاعب رف من ${RACK} قطع تُعوَّض من الكيس بعد كل حركة. الرف الخاص لا يراه الخصم.`, `Setiap pemain punya rak ${RACK} tile yang diisi ulang dari kantong. Rak tidak terlihat lawan.`],
  ['الحروف في اللعبة هي الحروف المعروضة على القطع فقط؛ لا تُطبَّق أي مطابقة تلقائية بين أ إ آ ا ولا بين ة ه ولا ى ي.', 'Huruf yang dihitung adalah huruf yang tertera di tile; tidak ada penyamaan otomatis أ إ آ ا, ة ه, ى ي.'],
  ['القطعة الفارغة تمثّل أي حرف من حروف النمط المختار، ويُحدَّد حرفها عند وضعها.', 'Tile kosong mewakili salah satu huruf mode yang dipilih; hurufnya ditentukan saat diletakkan.'],
  ['التشكيل للمساعدة على القراءة ولا يغيّر عدد الحروف.', 'Harakat hanya membantu bacaan dan tidak mengubah jumlah huruf.']
];

const section = (title, sub, body, open = false) => `<details class="tkAcc"${open ? ' open' : ''}><summary><span lang="ar">${title}</span><span class="wrId" lang="id" dir="ltr">${sub}</span></summary><div class="tkAccB">${body}</div></details>`;

// mode: the tile mode of the current match ('expanded' | 'basic')
export function tahkimRulesHtml(mode) {
  return `<div class="tkRules">`
    + section('قواعد تكوين الكلمات', 'Aturan pembentukan kata', `<ol class="wrList chk">${CHECK.map(([a, i]) => L(a, i)).join('')}</ol><h4 class="wrH no">✖ غير مسموح · Tidak boleh</h4>${ul(NO, 'no')}`, true)
    + section('الكلمات المقبولة', 'Kata yang diterima', `<h4 class="wrH ok">✔ مسموح · Boleh</h4>${ul(OK, 'ok')}`)
    + section('قواعد الحركات', 'Aturan giliran & langkah', ul(turn()))
    + section('نظام النقاط', 'Sistem poin', ul(scoring()))
    + section('قواعد استخدام الحروف', 'Aturan huruf & tile', ul(letters(mode)) + tilesTable(mode))
    + `</div>`;
}

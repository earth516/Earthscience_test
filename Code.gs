/**
 * SJ 문제은행 - 로그인 · 기록 저장 (Google Apps Script)
 *
 * 시트 구성 (setup()을 한 번 실행하면 자동으로 만들어져요)
 *   명단   : 학번 | 이름 | 비밀번호 | 과목
 *            과목 칸을 비우면 모든 과목 이용 가능
 *            특정 과목만 허용하려면  통합과학  또는  통합과학, 지구과학  처럼 적기
 *   체크   : 과목 | 학번 | 이름 | 문제 | 설명 | 체크한 시각          (자동 기록)
 *   OX기록 : 과목 | 학번 | 이름 | 문장ID | 문장 | 푼 횟수 | 틀린 횟수 | 최근 결과 | 최근 시각  (자동 기록)
 *
 * 과목마다 사이트의 SUBJECT 값('통합과학', '지구과학')으로 구분되므로
 * 여러 과목이 이 시트 하나를 같이 써도 돼요.
 */

const ROSTER = { name: '명단',   head: ['학번', '이름', '비밀번호', '과목'] };
const CHECK  = { name: '체크',   head: ['과목', '학번', '이름', '문제', '설명', '체크한 시각'] };
const OXLOG  = { name: 'OX기록', head: ['과목', '학번', '이름', '문장ID', '문장', '푼 횟수', '틀린 횟수', '최근 결과', '최근 시각'] };

/** 처음 한 번 실행: 탭을 만들고 권한을 승인해요. */
function setup() {
  [ROSTER, CHECK, OXLOG].forEach(getSheet_);
  SpreadsheetApp.getActive().toast('준비 완료! 명단 탭에 학생을 입력하세요.');
}

/** 브라우저로 웹 앱 주소를 열었을 때 작동 확인용 */
function doGet() {
  return ContentService.createTextOutput('SJ 문제은행 서버가 작동 중이에요.');
}

/** 사이트에서 보내는 요청 처리 */
function doPost(e) {
  let req;
  try { req = JSON.parse(e.postData.contents); }
  catch (err) { return json_({ ok: false, error: '요청 형식이 올바르지 않아요.' }); }

  const user = auth_(req);
  if (!user) return json_({ ok: false, code: 'auth', error: '학번 또는 비밀번호가 맞지 않아요.' });
  if (user.denied) return json_({ ok: false, code: 'auth', error: '이 과목 명단에 없어요. 선생님께 문의하세요.' });

  const subject = String(req.subject || '');
  if (req.action === 'login' || req.action === 'load') {
    return json_(Object.assign({ ok: true, name: user.name }, loadState_(subject, user.id)));
  }
  if (req.action === 'sync') {
    const lock = LockService.getScriptLock();
    lock.waitLock(20000);   // 여러 학생이 동시에 저장해도 꼬이지 않게
    try { applyOps_(subject, user, Array.isArray(req.ops) ? req.ops : []); }
    finally { lock.releaseLock(); }
    return json_({ ok: true });
  }
  return json_({ ok: false, error: '알 수 없는 요청이에요.' });
}

/* ---------------- 내부 함수 ---------------- */

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function getSheet_(def) {
  const ss = SpreadsheetApp.getActive();
  let sh = ss.getSheetByName(def.name);
  if (!sh) {
    sh = ss.insertSheet(def.name);
    sh.getRange(1, 1, 1, def.head.length).setValues([def.head]).setFontWeight('bold');
    sh.setFrozenRows(1);
    // 학번·문제·문장ID가 숫자로 바뀌지 않도록 텍스트 형식으로 고정
    const textCols = def === ROSTER ? ['A', 'C'] : def === CHECK ? ['B', 'D'] : ['B', 'D'];
    textCols.forEach(c => sh.getRange(c + ':' + c).setNumberFormat('@'));
  }
  return sh;
}

function rows_(sh, display) {
  const n = sh.getLastRow();
  if (n < 2) return [];
  const range = sh.getRange(2, 1, n - 1, sh.getLastColumn());
  return display ? range.getDisplayValues() : range.getValues();
}

function auth_(req) {
  const id = String(req.id || '').trim(), pw = String(req.pw || '').trim();
  if (!id || !pw) return null;
  const row = rows_(getSheet_(ROSTER), true).find(r => String(r[0]).trim() === id);
  if (!row || String(row[2]).trim() !== pw) return null;
  const allowed = String(row[3] || '').trim();
  if (allowed && allowed.split(/[,\s]+/).indexOf(String(req.subject)) < 0) return { denied: true };
  return { id: id, name: String(row[1]).trim() };
}

function loadState_(subject, id) {
  const mine = r => String(r[0]) === subject && String(r[1]).trim() === id;
  const checks = rows_(getSheet_(CHECK), true).filter(mine).map(r => String(r[3]));
  const oxWrong = rows_(getSheet_(OXLOG), true).filter(r => mine(r) && r[7] === '틀림').map(r => String(r[3]));
  return { checks: checks, oxWrong: oxWrong };
}

function applyOps_(subject, user, ops) {
  const now = new Date();
  const mine = r => String(r[0]) === subject && String(r[1]).trim() === user.id;

  /* 체크: 문제별 최종 상태만 반영 */
  const checkOps = ops.filter(o => o && o.t === 'check' && o.key);
  if (checkOps.length) {
    const sh = getSheet_(CHECK);
    const data = rows_(sh, true);
    const want = new Map();
    checkOps.forEach(o => want.set(String(o.key), o));
    const del = [], have = new Set();
    data.forEach((r, i) => {
      const key = String(r[3]);
      if (!mine(r) || !want.has(key)) return;
      if (!want.get(key).on || have.has(key)) del.push(i + 2); else have.add(key);
    });
    del.sort((a, b) => b - a).forEach(rowNo => sh.deleteRow(rowNo));
    const add = [];
    want.forEach((o, key) => { if (o.on && !have.has(key)) add.push([subject, user.id, user.name, key, String(o.label || ''), now]); });
    if (add.length) sh.getRange(sh.getLastRow() + 1, 1, add.length, add[0].length).setValues(add);
  }

  /* OX: 문장별로 푼 횟수·틀린 횟수·최근 결과 누적 */
  const oxOps = ops.filter(o => o && o.t === 'ox' && o.sid);
  if (oxOps.length) {
    const sh = getSheet_(OXLOG);
    const data = rows_(sh, false);
    const width = OXLOG.head.length;
    const index = new Map();
    data.forEach((r, i) => { if (mine(r)) index.set(String(r[3]), i); });
    const changed = new Map(), adds = [], addIndex = new Map();
    oxOps.forEach(o => {
      const sid = String(o.sid);
      let row;
      if (index.has(sid)) {
        const i = index.get(sid);
        row = changed.get(i) || data[i].slice(0, width);
        changed.set(i, row);
      } else if (addIndex.has(sid)) {
        row = adds[addIndex.get(sid)];
      } else {
        row = [subject, user.id, user.name, sid, '', 0, 0, '', ''];
        addIndex.set(sid, adds.length); adds.push(row);
      }
      row[4] = String(o.text || row[4] || '');
      row[5] = Number(row[5] || 0) + 1;
      if (!o.correct) row[6] = Number(row[6] || 0) + 1;
      row[7] = o.correct ? '맞음' : '틀림';
      row[8] = now;
    });
    changed.forEach((row, i) => sh.getRange(i + 2, 1, 1, width).setValues([row]));
    if (adds.length) sh.getRange(sh.getLastRow() + 1, 1, adds.length, width).setValues(adds);
  }
}

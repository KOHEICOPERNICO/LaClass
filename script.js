import { initializeApp } from "https://www.gstatic.com/firebasejs/12.15.0/firebase-app.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/12.15.0/firebase-analytics.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.15.0/firebase-auth.js";
import { getFirestore, doc, getDoc, setDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/12.15.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyAWenBcaaXd00FiDnyyjwf3FWFVGWYH_HI",
  authDomain: "zasekiapp-648b7.firebaseapp.com",
  projectId: "zasekiapp-648b7",
  storageBucket: "zasekiapp-648b7.firebasestorage.app",
  messagingSenderId: "182370319145",
  appId: "1:182370319145:web:53afb7d1ba5360bb275538",
  measurementId: "G-5QCY60B9B0"
};

const firebaseApp = initializeApp(firebaseConfig);
try { getAnalytics(firebaseApp); } catch (error) { console.info("Analytics unavailable", error); }
const auth = getAuth(firebaseApp);
const provider = new GoogleAuthProvider();
const db = getFirestore(firebaseApp);

const $ = (id) => document.getElementById(id);

let state = {
  currentYear: "2026",
  currentClassId: null,
  years: ["2026"],
  classes: [],
  printSettings: {
    printMode: "posting",
    orientation: "portrait",
    showNumber: true,
    showGender: true,
    ngZone: "around"
  },
  picker: {
    historyByClass: {},
    absentByClass: {}
  }
};

let currentSeats = [];
let draggedSeatIndex = null;
let currentUser = null;
let autoSaveTimer = null;
let isCloudSaving = false;
let lastCloudSavedAt = null;

function uid() {
  return "id_" + Math.random().toString(36).slice(2, 10);
}

function migrateState() {
  state.years = state.years || ["2026"];
  state.currentYear = state.currentYear || state.years[0] || "2026";
  state.picker = state.picker || { historyByClass: {}, absentByClass: {} };
  state.picker.historyByClass = state.picker.historyByClass || {};
  state.picker.absentByClass = state.picker.absentByClass || {};
  state.printSettings = state.printSettings || {
    printMode: "posting",
    orientation: "portrait",
    showNumber: true,
    showGender: true,
    ngZone: "around"
  };
  state.classes = state.classes || [];

  state.classes.forEach(cls => {
    cls.year = cls.year || state.currentYear || "2026";
    cls.genders = cls.genders || {};
    cls.ngPairs = cls.ngPairs || [];
    cls.careMemos = cls.careMemos || {};
    cls.lastSeats = cls.lastSeats || [];
    cls.currentSeats = cls.currentSeats || [];
    cls.updatedAtText = cls.updatedAtText || "";
  });
}

function saveState(options = { cloud: true }) {
  localStorage.setItem("laclass60LocalState", JSON.stringify(state));
  updateSaveStatus(currentUser ? "端末保存済み・クラウド保存待ち" : "端末保存済み");

  if (options.cloud && currentUser) {
    scheduleCloudSave();
  }
}

function updateSaveStatus(message, type = "") {
  const status = $("saveStatus");
  if (!status) return;
  status.classList.remove("saving", "saved", "error");
  if (type) status.classList.add(type);
  status.textContent = `保存状態：${message}`;
}

function scheduleCloudSave() {
  if (!currentUser) return;
  clearTimeout(autoSaveTimer);
  updateSaveStatus("自動保存待ち", "saving");
  autoSaveTimer = setTimeout(async () => {
    try {
      await saveToCloud({ silent: true });
    } catch (error) {
      console.error(error);
      updateSaveStatus("自動保存に失敗しました", "error");
    }
  }, 1800);
}

function formatSavedTime(date) {
  if (!date) return "";
  const h = String(date.getHours()).padStart(2, "0");
  const m = String(date.getMinutes()).padStart(2, "0");
  const s = String(date.getSeconds()).padStart(2, "0");
  return `${h}:${m}:${s}`;
}

function getUserDocRef() {
  if (!currentUser) return null;
  return doc(db, "users", currentUser.uid, "appData", "main");
}

async function saveToCloud(options = { silent: false }) {
  if (!currentUser) {
    if (!options.silent) alert("クラウド保存にはGoogleログインが必要です。");
    updateSaveStatus("未ログインのため端末保存のみ", "error");
    return false;
  }
  if (isCloudSaving) return false;
  isCloudSaving = true;
  updateSaveStatus("クラウド保存中...", "saving");

  await setDoc(getUserDocRef(), {
    state,
    updatedAt: serverTimestamp(),
    app: "LaClass",
    version: "6.0"
  }, { merge: true });

  isCloudSaving = false;
  lastCloudSavedAt = new Date();
  updateSaveStatus(`クラウド保存済み ${formatSavedTime(lastCloudSavedAt)}`, "saved");
  if (!options.silent) updateLoginUI("クラウド保存しました。");
  return true;
}

async function loadFromCloud() {
  if (!currentUser) return false;
  const snap = await getDoc(getUserDocRef());
  if (snap.exists() && snap.data().state) {
    state = snap.data().state;
    migrateState();
    localStorage.setItem("laclass60LocalState", JSON.stringify(state));
    currentSeats = currentClass().currentSeats || [];
    renderAll();
    updateLoginUI("クラウドから読み込みました。");
    updateSaveStatus("クラウドから読み込み済み", "saved");
    return true;
  }
  updateLoginUI("ログイン中です。まだクラウド保存データはありません。");
  updateSaveStatus("クラウド保存データなし", "saving");
  return false;
}

function updateLoginUI(message = "") {
  const notice = $("loginNotice");
  const loginBtn = $("loginBtn");
  const logoutBtn = $("logoutBtn");
  if (!notice || !loginBtn || !logoutBtn) return;

  if (currentUser) {
    notice.classList.add("logged-in");
    notice.innerHTML = `<strong>ログイン中：</strong>${currentUser.email || "Googleユーザー"}　${message || "クラウド自動保存が使えます。"}`;
    loginBtn.classList.add("hidden");
    logoutBtn.classList.remove("hidden");
  } else {
    notice.classList.remove("logged-in");
    notice.innerHTML = `<strong>未ログインです。</strong>現在はこの端末だけに一時保存されます。クラウド自動保存にはGoogleログインが必要です。`;
    loginBtn.classList.remove("hidden");
    logoutBtn.classList.add("hidden");
  }
}

async function loginWithGoogle() {
  try {
    await signInWithPopup(auth, provider);
  } catch (error) {
    console.error(error);
    alert("Googleログインに失敗しました。Authenticationや承認済みドメインを確認してください。");
  }
}

async function logoutGoogle() {
  try {
    await signOut(auth);
  } catch (error) {
    console.error(error);
    alert("ログアウトに失敗しました。");
  }
}

function loadState() {
  const saved60 = localStorage.getItem("laclass60LocalState");
  const saved50 = localStorage.getItem("laclass40LocalState");
  if (saved60) state = JSON.parse(saved60);
  else if (saved50) state = JSON.parse(saved50);

  migrateState();

  if (!state.classes || state.classes.length === 0) {
    const defaultClass = {
      id: uid(),
      year: "2026",
      name: "高2A",
      students: [
        "田中 太郎", "佐藤 花子", "鈴木 一郎", "高橋 美咲", "伊藤 蓮",
        "渡辺 葵", "山本 陽翔", "中村 結衣", "小林 蒼", "加藤 さくら",
        "吉田 悠真", "山田 凛", "佐々木 湊", "松本 心春", "井上 大和",
        "木村 詩", "林 颯太", "清水 美月", "斎藤 陽菜", "森 翔"
      ],
      genders: {},
      ngPairs: [["田中 太郎", "佐藤 花子"]],
      careMemos: {},
      lastSeats: [],
      currentSeats: [],
      updatedAtText: ""
    };

    defaultClass.students.forEach((name, index) => {
      defaultClass.genders[name] = index % 2 === 0 ? "男" : "女";
    });

    state.years = ["2026"];
    state.currentYear = "2026";
    state.classes = [defaultClass];
    state.currentClassId = defaultClass.id;
    saveState({ cloud: false });
  }

  if (!state.currentClassId || !currentClass()) {
    const first = classesForCurrentYear()[0] || state.classes[0];
    state.currentClassId = first?.id || null;
  }
}

function currentClass() {
  return state.classes.find(c => c.id === state.currentClassId) || state.classes[0];
}

function classesForCurrentYear() {
  return state.classes.filter(c => String(c.year) === String(state.currentYear));
}

function getStudents() {
  return currentClass()?.students || [];
}

function studentNumber(name) {
  return getStudents().indexOf(name) + 1;
}

function classPickerHistory(cls = currentClass()) {
  if (!cls) return [];
  state.picker.historyByClass[cls.id] = state.picker.historyByClass[cls.id] || [];
  return state.picker.historyByClass[cls.id];
}

function classAbsentList(cls = currentClass()) {
  if (!cls) return [];
  state.picker.absentByClass[cls.id] = state.picker.absentByClass[cls.id] || [];
  return state.picker.absentByClass[cls.id];
}

function shuffle(array) {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function setView(viewId) {
  document.querySelectorAll(".view").forEach(v => v.classList.remove("active"));
  document.querySelectorAll(".nav-item").forEach(n => n.classList.remove("active"));
  $(viewId).classList.add("active");
  const nav = document.querySelector(`.nav-item[data-view="${viewId}"]`);
  if (nav) nav.classList.add("active");

  const titles = {
    dashboardView: "ホーム",
    classView: "クラス管理",
    seatView: "座席表",
    groupView: "班分け",
    pickerView: "指名ルーレット",
    orderView: "発表順",
    timerView: "タイマー",
    settingsView: "設定"
  };
  $("pageTitle").textContent = titles[viewId] || "LaClass";
}

function renderYearSelect() {
  $("schoolYearSelect").innerHTML = state.years.map(y => `<option value="${y}">${y}年度</option>`).join("");
  $("schoolYearSelect").value = state.currentYear;
}

function renderClassSelect() {
  const list = classesForCurrentYear();
  if (!list.some(c => c.id === state.currentClassId) && list.length) {
    state.currentClassId = list[0].id;
  }
  $("classSelect").innerHTML = list.map(c => `<option value="${c.id}">${c.name}</option>`).join("");
  $("classSelect").value = state.currentClassId;
}

function renderDashboard() {
  const cls = currentClass();
  $("studentCount").textContent = `${cls?.students?.length || 0}人`;
  $("currentClassLabel").textContent = cls ? `${cls.year}年度 ${cls.name}` : "クラス未選択";
  renderClassCards($("dashboardClassSearch")?.value || "");
}

function renderClassCards(query = "") {
  const q = query.trim().toLowerCase();
  const list = classesForCurrentYear().filter(c => !q || c.name.toLowerCase().includes(q));
  $("classCards").innerHTML = list.length ? list.map(c => `
    <div class="class-card ${c.id === state.currentClassId ? "active-class" : ""}" data-class-id="${c.id}">
      <h4>${c.name}</h4>
      <p>${c.students.length}人 / ${c.year}年度</p>
      <small>NGペア ${c.ngPairs?.length || 0}組 / 更新 ${c.updatedAtText || "未保存"}</small>
    </div>
  `).join("") : `<p class="muted">該当するクラスがありません。</p>`;

  document.querySelectorAll(".class-card").forEach(card => {
    card.addEventListener("click", () => {
      state.currentClassId = card.dataset.classId;
      currentSeats = currentClass().currentSeats || [];
      saveState();
      renderAll();
      setView("classView");
    });
  });
}

function renderYearList() {
  $("yearList").innerHTML = state.years.map(y => `
    <button class="pill ${String(y) === String(state.currentYear) ? "active" : ""}" data-year="${y}">${y}年度</button>
  `).join("");

  document.querySelectorAll("[data-year]").forEach(btn => {
    btn.addEventListener("click", () => {
      state.currentYear = btn.dataset.year;
      const first = classesForCurrentYear()[0];
      if (first) state.currentClassId = first.id;
      saveState();
      renderAll();
    });
  });
}

function renderClassSearch() {
  const q = $("classSearchInput")?.value?.trim()?.toLowerCase() || "";
  const list = state.classes.filter(c => !q || `${c.year} ${c.name}`.toLowerCase().includes(q));
  $("classSearchResult").innerHTML = list.length ? list.map(c => `
    <div class="memo-item">
      <strong>${c.year}年度 ${c.name}</strong><br>
      <span>${c.students.length}人</span><br>
      <button class="remove-btn" data-select-class="${c.id}">このクラスを開く</button>
    </div>
  `).join("") : `<p class="muted">該当するクラスがありません。</p>`;

  document.querySelectorAll("[data-select-class]").forEach(btn => {
    btn.addEventListener("click", () => {
      const cls = state.classes.find(c => c.id === btn.dataset.selectClass);
      if (!cls) return;
      state.currentYear = cls.year;
      state.currentClassId = cls.id;
      currentSeats = cls.currentSeats || [];
      saveState();
      renderAll();
    });
  });
}

function renderSettings() {
  const cls = currentClass();
  if (!cls) return;
  $("classNameInput").value = cls.name;
  $("studentInput").value = cls.students.join("\n");

  const options = cls.students.map(s => `<option value="${s}">${s}</option>`).join("");
  $("careStudentSelect").innerHTML = options;
  $("ngStudentA").innerHTML = options;
  $("ngStudentB").innerHTML = options;

  renderGenderList();
  renderCareMemos();
  renderNgPairs();
  renderStudentTable();
  renderAbsentList();
  renderPickerHistory();
}

function renderStudentTable() {
  const cls = currentClass();
  $("studentTable").innerHTML = `
    <div class="student-row header"><span>番号</span><span>名前</span><span>性別</span><span>配慮メモ</span></div>
    ${cls.students.map((name, index) => `
      <div class="student-row">
        <span>${index + 1}</span>
        <strong>${name}</strong>
        <span>${cls.genders[name] || "未設定"}</span>
        <span>${cls.careMemos[name] || "-"}</span>
      </div>
    `).join("")}
  `;
}

function renderGenderList() {
  const cls = currentClass();
  $("genderList").innerHTML = cls.students.map(name => `
    <div class="gender-row">
      <strong>${studentNumber(name)}. ${name}</strong>
      <select data-gender-name="${name}">
        <option value="" ${!cls.genders[name] ? "selected" : ""}>未設定</option>
        <option value="男" ${cls.genders[name] === "男" ? "selected" : ""}>男</option>
        <option value="女" ${cls.genders[name] === "女" ? "selected" : ""}>女</option>
        <option value="その他" ${cls.genders[name] === "その他" ? "selected" : ""}>その他</option>
      </select>
    </div>
  `).join("");
}

function renderCareMemos() {
  const entries = Object.entries(currentClass().careMemos || {});
  $("careMemoList").innerHTML = entries.length
    ? entries.map(([name, memo]) => `
      <div class="memo-item">
        <strong>${name}</strong><br>
        <span>${memo}</span><br>
        <button class="remove-btn" onclick="removeCareMemo('${escapeForAttr(name)}')">削除</button>
      </div>`).join("")
    : `<p class="muted">まだ配慮メモはありません。</p>`;
}

function renderNgPairs() {
  const cls = currentClass();
  $("ngPairList").innerHTML = cls.ngPairs.length
    ? cls.ngPairs.map((pair, index) => `
      <div class="memo-item">
        <strong>${pair[0]}</strong> × <strong>${pair[1]}</strong><br>
        <button class="remove-btn" onclick="removeNgPair(${index})">削除</button>
      </div>`).join("")
    : `<p class="muted">まだNGペアはありません。</p>`;
}

function escapeForAttr(value) { return value.replace(/'/g, "\\'"); }
function removeCareMemo(name) { delete currentClass().careMemos[name]; saveState(); renderAll(); }
function removeNgPair(index) { currentClass().ngPairs.splice(index, 1); saveState(); renderAll(); }
window.removeCareMemo = removeCareMemo;
window.removeNgPair = removeNgPair;

function renderAll() {
  renderYearSelect();
  renderClassSelect();
  renderDashboard();
  renderYearList();
  renderClassSearch();
  renderSettings();
  applyPrintSettings();
  if (currentSeats.length) renderSeats();
}

function applyPrintSettings() {
  const area = $("printSeatArea");
  area.classList.remove("print-posting", "print-teacher", "portrait", "landscape");
  area.classList.add(`print-${state.printSettings.printMode}`);
  area.classList.add(state.printSettings.orientation);

  document.querySelectorAll(".print-mode-btn").forEach(btn => btn.classList.toggle("active", btn.dataset.printMode === state.printSettings.printMode));
  document.querySelectorAll(".orientation-btn").forEach(btn => btn.classList.toggle("active", btn.dataset.orientation === state.printSettings.orientation));
  document.querySelectorAll(".ng-zone-btn").forEach(btn => btn.classList.toggle("active", btn.dataset.zone === state.printSettings.ngZone));

  $("showNumberCheck").checked = state.printSettings.showNumber;
  $("showGenderCheck").checked = state.printSettings.showGender;
  document.body.classList.toggle("hide-number", !state.printSettings.showNumber);
  document.body.classList.toggle("hide-gender", !state.printSettings.showGender);
}

function makeCards(title, items) {
  return `<div class="card"><h4>${title}</h4><ul>${items.map(i => `<li>${i}</li>`).join("")}</ul></div>`;
}

function seatFillIndexes(rows, cols, direction) {
  const indexes = [];
  if (direction === "vertical") {
    for (let c = 0; c < cols; c++) for (let r = 0; r < rows; r++) indexes.push(r * cols + c);
  } else {
    for (let i = 0; i < rows * cols; i++) indexes.push(i);
  }
  return indexes;
}

function displayIndexes(rows, cols) {
  const indexes = [];
  if (state.printSettings.printMode === "teacher") {
    for (let r = rows - 1; r >= 0; r--) for (let c = 0; c < cols; c++) indexes.push(r * cols + c);
  } else {
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) indexes.push(r * cols + c);
  }
  return indexes;
}

function getSeatRelation(indexA, indexB, cols) {
  const rA = Math.floor(indexA / cols), cA = indexA % cols;
  const rB = Math.floor(indexB / cols), cB = indexB % cols;
  const dr = Math.abs(rA - rB), dc = Math.abs(cA - cB);
  if (dr === 0 && dc === 1) return "side";
  if (dr === 1 && dc === 0) return "frontBack";
  if (dr === 1 && dc === 1) return "diagonal";
  return "none";
}

function isRelationBlocked(relation) {
  const zone = state.printSettings.ngZone || "around";
  if (relation === "none") return false;
  if (zone === "side") return relation === "side";
  if (zone === "frontBack") return relation === "side" || relation === "frontBack";
  if (zone === "diagonal") return relation === "side" || relation === "diagonal";
  if (zone === "around") return relation === "side" || relation === "frontBack" || relation === "diagonal";
  return relation === "side";
}

function getBlockedIndexes(index, rows, cols) {
  const indexes = [];
  for (let target = 0; target < rows * cols; target++) {
    if (target === index) continue;
    if (isRelationBlocked(getSeatRelation(index, target, cols))) indexes.push(target);
  }
  return indexes;
}

function hasNgNear(seats, index, rows, cols) {
  const name = seats[index];
  if (!name) return false;
  const cls = currentClass();
  return getBlockedIndexes(index, rows, cols).some(nIndex => {
    const other = seats[nIndex];
    if (!other) return false;
    return cls.ngPairs.some(pair => (pair[0] === name && pair[1] === other) || (pair[1] === name && pair[0] === other));
  });
}

function getNgNearNames(seats, rows, cols) {
  return [...new Set(seats.filter((name, index) => name && hasNgNear(seats, index, rows, cols)))];
}

function countProblems(seats, rows, cols, mode) {
  const warnings = [];
  if ($("avoidNgPairCheck").checked) {
    const unique = getNgNearNames(seats, rows, cols);
    if (unique.length) {
      const zoneLabel = {side:"左右の隣", frontBack:"左右＋前後", diagonal:"左右＋斜め", around:"周囲8方向"}[state.printSettings.ngZone] || "指定範囲";
      warnings.push(`NGペアが${zoneLabel}の範囲内にいる可能性：${unique.join("、")}`);
    }
  }

  if ($("avoidPreviousCheck").checked) {
    const cls = currentClass();
    const same = seats.map((name, index) => name && cls.lastSeats[index] === name ? name : null).filter(Boolean);
    if (same.length) warnings.push(`前回と同じ席の生徒：${same.join("、")}`);
  }

  if (mode && mode.includes("gender")) {
    const unknown = currentClass().students.filter(s => !currentClass().genders[s]);
    if (unknown.length) warnings.push(`性別未設定の生徒がいます：${unknown.join("、")}`);
  }

  return warnings;
}

function problemScore(seats, rows, cols) {
  let score = 0;
  if ($("avoidNgPairCheck").checked) score += getNgNearNames(seats, rows, cols).length * 10;
  if ($("avoidPreviousCheck").checked) {
    const cls = currentClass();
    score += seats.filter((name, index) => name && cls.lastSeats[index] === name).length;
  }
  return score;
}

function showWarnings(warnings) {
  const box = $("seatWarnings");
  if (!warnings.length) {
    box.classList.add("hidden");
    box.innerHTML = "";
    return;
  }
  box.classList.remove("hidden");
  box.innerHTML = warnings.map(w => `<div>⚠️ ${w}</div>`).join("");
}

function applyFixedSeat(seats, availableNames, cols, total) {
  let remaining = [...availableNames];
  const fixedName = $("fixedStudent").value.trim();
  const fixedPosition = $("fixedPosition").value.trim();

  if (fixedName && fixedPosition && availableNames.includes(fixedName)) {
    const match = fixedPosition.match(/^(\d+)-(\d+)$/);
    if (match) {
      const r = Number(match[1]), c = Number(match[2]);
      const index = (r - 1) * cols + (c - 1);
      if (index >= 0 && index < total) {
        seats[index] = fixedName;
        remaining = remaining.filter(s => s !== fixedName);
      }
    }
  }
  return remaining;
}

function improveSeats(seats, rows, cols) {
  for (let attempt = 0; attempt < 1200; attempt++) {
    let currentScore = problemScore(seats, rows, cols);
    if (currentScore === 0) break;
    let bestSeats = seats, bestScore = currentScore;

    for (let trial = 0; trial < 80; trial++) {
      const i = Math.floor(Math.random() * seats.length);
      const j = Math.floor(Math.random() * seats.length);
      if (i === j) continue;
      const copy = [...seats];
      [copy[i], copy[j]] = [copy[j], copy[i]];
      const score = problemScore(copy, rows, cols);
      if (score < bestScore) {
        bestScore = score;
        bestSeats = copy;
      }
    }

    if (bestScore < currentScore) seats = bestSeats;
    else break;
  }
  return seats;
}

function buildGenderAlternatingOrder(students) {
  const cls = currentClass();
  const boys = students.filter(s => cls.genders[s] === "男");
  const girls = students.filter(s => cls.genders[s] === "女");
  const others = students.filter(s => cls.genders[s] !== "男" && cls.genders[s] !== "女");
  const result = [];
  let b = 0, g = 0;
  let turn = boys.length >= girls.length ? "男" : "女";

  while (b < boys.length || g < girls.length) {
    if (turn === "男") {
      if (b < boys.length) result.push(boys[b++]);
      if (g < girls.length) result.push(girls[g++]);
    } else {
      if (g < girls.length) result.push(girls[g++]);
      if (b < boys.length) result.push(boys[b++]);
    }
  }
  return [...result, ...others];
}

function buildBalancedOrder(students) {
  return buildGenderAlternatingOrder(shuffle(students));
}

function placeCareStudentsFirst(seats, remaining, cols, total) {
  const careNames = Object.keys(currentClass().careMemos || {}).filter(name => remaining.includes(name));
  const frontIndexes = [];
  for (let i = 0; i < Math.min(cols * 2, total); i++) if (!seats[i]) frontIndexes.push(i);

  careNames.forEach(name => {
    if (frontIndexes.length) {
      const index = frontIndexes.shift();
      seats[index] = name;
      remaining = remaining.filter(s => s !== name);
    }
  });
  return remaining;
}

function fillSeatsByOrder(order, direction, mode) {
  const students = getStudents();
  const rows = Number($("seatRows").value);
  const cols = Number($("seatCols").value);
  const total = rows * cols;

  if (!students.length) return alert("先にクラス名簿を登録してください。");
  if (total < students.length) return alert("席数が人数より少ないです。");

  let seats = Array(total).fill("");
  let remaining = applyFixedSeat(seats, order, cols, total);

  if ($("frontCareCheck").checked && !mode.includes("number")) {
    remaining = placeCareStudentsFirst(seats, remaining, cols, total);
  }

  const indexes = seatFillIndexes(rows, cols, direction);
  let pointer = 0;
  for (const index of indexes) {
    if (!seats[index]) seats[index] = remaining[pointer++] || "";
  }

  if (!mode.includes("number")) seats = improveSeats(seats, rows, cols);

  currentSeats = seats;
  const cls = currentClass();
  cls.currentSeats = seats;
  cls.updatedAtText = "今";
  saveState();
  renderSeats(rows, cols);
  showWarnings(countProblems(seats, rows, cols, mode));

  if (!mode.includes("number")) {
    cls.lastSeats = [...seats];
    saveState();
  }
}

function createSeats(mode = "random") {
  const students = getStudents();
  if (mode === "random") return fillSeatsByOrder(shuffle(students), "horizontal", mode);
  if (mode === "balanced") return fillSeatsByOrder(buildBalancedOrder(students), "horizontal", mode);
  if (mode === "numberVertical") return fillSeatsByOrder(students, "vertical", mode);
  if (mode === "numberHorizontal") return fillSeatsByOrder(students, "horizontal", mode);
  if (mode === "genderVertical") return fillSeatsByOrder(buildGenderAlternatingOrder(students), "vertical", mode);
  if (mode === "genderHorizontal") return fillSeatsByOrder(buildGenderAlternatingOrder(students), "horizontal", mode);
}

function renderSeats(rows = Number($("seatRows").value), cols = Number($("seatCols").value)) {
  const chart = $("seatChart");
  const cls = currentClass();
  chart.innerHTML = "";
  chart.style.gridTemplateColumns = `repeat(${cols}, minmax(104px, 132px))`;

  displayIndexes(rows, cols).forEach((actualIndex) => {
    const name = currentSeats[actualIndex];
    const div = document.createElement("div");
    const hasCare = name && cls.careMemos && cls.careMemos[name];
    const hasNgRisk = name && $("avoidNgPairCheck") && $("avoidNgPairCheck").checked && hasNgNear(currentSeats, actualIndex, rows, cols);
    div.className = "seat" + (name ? "" : " empty") + (hasCare ? " care" : "") + (hasNgRisk ? " ng-risk" : "");
    div.draggable = true;
    div.dataset.index = actualIndex;
    div.title = hasCare ? cls.careMemos[name] : `${Math.floor(actualIndex / cols) + 1}-${actualIndex % cols + 1}`;

    const gender = name ? (cls.genders[name] || "未") : "";
    const number = name ? studentNumber(name) : "";
    div.innerHTML = name
      ? `<span>${name}</span><span class="seat-meta"><span class="seat-number">${number}</span><span class="seat-number seat-gender-separator"> / </span><span class="seat-gender">${gender}</span></span>`
      : `<span>空席</span>`;

    div.addEventListener("dragstart", () => {
      draggedSeatIndex = actualIndex;
      div.classList.add("dragging");
    });
    div.addEventListener("dragend", () => {
      draggedSeatIndex = null;
      div.classList.remove("dragging");
    });
    div.addEventListener("dragover", event => event.preventDefault());
    div.addEventListener("drop", () => {
      if (draggedSeatIndex === null) return;
      const targetIndex = Number(div.dataset.index);
      [currentSeats[draggedSeatIndex], currentSeats[targetIndex]] = [currentSeats[targetIndex], currentSeats[draggedSeatIndex]];
      currentClass().currentSeats = currentSeats;
      currentClass().updatedAtText = "今";
      saveState();
      renderSeats(rows, cols);
      showWarnings(countProblems(currentSeats, rows, cols));
    });

    chart.appendChild(div);
  });

  applyPrintSettings();
}

function createClass() {
  const year = $("newClassYear").value.trim() || state.currentYear || "2026";
  const name = $("newClassName").value.trim();
  const students = $("newClassStudents").value.split("\n").map(s => s.trim()).filter(Boolean);

  if (!name || students.length === 0) return alert("クラス名と名簿を入力してください。");
  if (!state.years.includes(year)) state.years.push(year);

  const cls = {
    id: uid(),
    year,
    name,
    students,
    genders: {},
    ngPairs: [],
    careMemos: {},
    lastSeats: [],
    currentSeats: [],
    updatedAtText: "今"
  };

  state.classes.push(cls);
  state.currentYear = year;
  state.currentClassId = cls.id;
  currentSeats = [];
  saveState();

  $("newClassYear").value = "";
  $("newClassName").value = "";
  $("newClassStudents").value = "";
  $("classModal").classList.add("hidden");

  renderAll();
  setView("classView");
}

function deleteCurrentClass() {
  if (state.classes.length <= 1) return alert("クラスは最低1つ必要です。");
  if (!confirm("現在のクラスを削除しますか？")) return;
  state.classes = state.classes.filter(c => c.id !== state.currentClassId);
  const first = classesForCurrentYear()[0] || state.classes[0];
  state.currentClassId = first.id;
  state.currentYear = first.year;
  currentSeats = first.currentSeats || [];
  saveState();
  renderAll();
  setView("dashboardView");
}

function updateClassInfo() {
  const cls = currentClass();
  const name = $("classNameInput").value.trim();
  const students = $("studentInput").value.split("\n").map(s => s.trim()).filter(Boolean);
  if (!name || students.length === 0) return alert("クラス名と名簿を入力してください。");

  cls.name = name;
  cls.students = students;
  cls.updatedAtText = "今";
  cls.genders = cls.genders || {};
  cls.careMemos = cls.careMemos || {};
  cls.ngPairs = (cls.ngPairs || []).filter(pair => students.includes(pair[0]) && students.includes(pair[1]));

  Object.keys(cls.genders).forEach(name => { if (!students.includes(name)) delete cls.genders[name]; });
  Object.keys(cls.careMemos).forEach(name => { if (!students.includes(name)) delete cls.careMemos[name]; });

  saveState();
  renderAll();
  alert("更新しました。");
}

function duplicateClass() {
  const cls = currentClass();
  const copy = JSON.parse(JSON.stringify(cls));
  copy.id = uid();
  copy.name = `${cls.name} コピー`;
  copy.updatedAtText = "今";
  state.classes.push(copy);
  state.currentClassId = copy.id;
  currentSeats = copy.currentSeats || [];
  saveState();
  renderAll();
}

function addYear() {
  const y = $("yearInput").value.trim();
  if (!y) return alert("年度を入力してください。");
  if (!state.years.includes(y)) state.years.push(y);
  state.currentYear = y;
  $("yearInput").value = "";
  saveState();
  renderAll();
}

function saveGenders() {
  const cls = currentClass();
  document.querySelectorAll("[data-gender-name]").forEach(select => {
    const name = select.dataset.genderName;
    const value = select.value;
    if (value) cls.genders[name] = value;
    else delete cls.genders[name];
  });
  cls.updatedAtText = "今";
  saveState();
  renderAll();
  alert("性別設定を保存しました。");
}

function addNgPair() {
  const a = $("ngStudentA").value;
  const b = $("ngStudentB").value;
  if (!a || !b || a === b) return alert("異なる2名を選んでください。");

  const cls = currentClass();
  const exists = cls.ngPairs.some(pair => (pair[0] === a && pair[1] === b) || (pair[0] === b && pair[1] === a));
  if (exists) return alert("このNGペアはすでに登録されています。");
  cls.ngPairs.push([a, b]);
  cls.updatedAtText = "今";
  saveState();
  renderAll();
}

function addCareMemo() {
  const student = $("careStudentSelect").value;
  const memo = $("careMemoInput").value.trim();
  if (!student || !memo) return alert("生徒名とメモを入力してください。");
  currentClass().careMemos[student] = memo;
  currentClass().updatedAtText = "今";
  $("careMemoInput").value = "";
  saveState();
  renderAll();
}

function makeGroups() {
  const students = getStudents();
  const count = Math.max(1, Number($("groupCount").value));
  const groups = Array.from({ length: count }, () => []);
  shuffle(students).forEach((student, index) => groups[index % count].push(student));
  $("groupResult").innerHTML = groups.map((g, i) => makeCards(`${i + 1}班`, g)).join("");
}

function makeOrder() {
  $("orderResult").innerHTML = shuffle(getStudents()).map(s => `<li>${studentNumber(s)}. ${s}</li>`).join("");
}

async function copyOrder() {
  const text = [...$("orderResult").querySelectorAll("li")].map((li, i) => `${i + 1}. ${li.textContent}`).join("\n");
  if (!text) return alert("先に順番を作ってください。");
  await navigator.clipboard.writeText(text);
  alert("コピーしました。");
}

function getPickerCandidates() {
  const cls = currentClass();
  let students = [...cls.students];
  const genderFilter = $("pickerGenderFilter").value;
  const history = classPickerHistory(cls).map(h => h.name);
  const absent = classAbsentList(cls);

  if (genderFilter !== "all") {
    students = students.filter(name => cls.genders[name] === genderFilter);
  }
  if ($("excludePickedCheck").checked) {
    students = students.filter(name => !history.includes(name));
  }
  if ($("skipAbsentCheck").checked) {
    students = students.filter(name => !absent.includes(name));
  }

  return students;
}

function pickStudent() {
  const cls = currentClass();
  let candidates = getPickerCandidates();

  if (!candidates.length && $("excludePickedCheck").checked) {
    if (confirm("対象者がいません。指名履歴をリセットして選び直しますか？")) {
      state.picker.historyByClass[cls.id] = [];
      candidates = getPickerCandidates();
    }
  }

  if (!candidates.length) return alert("指名できる生徒がいません。設定を確認してください。");

  const name = candidates[Math.floor(Math.random() * candidates.length)];
  const record = {
    name,
    number: studentNumber(name),
    time: new Date().toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" })
  };
  classPickerHistory(cls).unshift(record);
  cls.updatedAtText = "今";

  $("pickedStudent").textContent = name;
  $("pickedMeta").textContent = `${record.number}番 / ${record.time}`;
  saveState();
  renderPickerHistory();
}

function resetPicker() {
  if (!confirm("このクラスの指名履歴をリセットしますか？")) return;
  state.picker.historyByClass[currentClass().id] = [];
  $("pickedStudent").textContent = "?";
  $("pickedMeta").textContent = "履歴をリセットしました";
  saveState();
  renderPickerHistory();
}

function renderPickerHistory() {
  const history = classPickerHistory();
  $("pickerHistory").innerHTML = history.length
    ? history.map(h => `<span class="history-chip">${h.number}番 ${h.name} <small>${h.time}</small></span>`).join("")
    : `<p class="muted">まだ指名履歴はありません。</p>`;
}

function renderAbsentList() {
  const cls = currentClass();
  const absent = classAbsentList(cls);
  $("absentList").innerHTML = cls.students.map(name => `
    <div class="absent-row">
      <span>${studentNumber(name)}. ${name}</span>
      <label><input type="checkbox" data-absent-name="${name}" ${absent.includes(name) ? "checked" : ""}> 除外</label>
    </div>
  `).join("");

  document.querySelectorAll("[data-absent-name]").forEach(check => {
    check.addEventListener("change", () => {
      const list = classAbsentList(cls);
      const name = check.dataset.absentName;
      if (check.checked && !list.includes(name)) list.push(name);
      if (!check.checked) state.picker.absentByClass[cls.id] = list.filter(n => n !== name);
      saveState();
    });
  });
}

let timer = null;
let remainingSeconds = 300;
function updateTimerFromInput() { remainingSeconds = Number($("timerMinutes").value) * 60 + Number($("timerSeconds").value); }
function renderTimer() { $("timerDisplay").textContent = `${String(Math.floor(remainingSeconds / 60)).padStart(2, "0")}:${String(remainingSeconds % 60).padStart(2, "0")}`; }
function startTimer() {
  if (timer) return;
  if (remainingSeconds <= 0) updateTimerFromInput();
  timer = setInterval(() => {
    remainingSeconds = Math.max(0, remainingSeconds - 1);
    renderTimer();
    if (remainingSeconds === 0) {
      clearInterval(timer);
      timer = null;
      alert("時間です！");
    }
  }, 1000);
}
function pauseTimer() { clearInterval(timer); timer = null; }
function resetTimer() { pauseTimer(); updateTimerFromInput(); renderTimer(); }

function bindEvents() {
  document.querySelectorAll(".nav-item").forEach(button => button.addEventListener("click", () => setView(button.dataset.view)));
  document.querySelectorAll("[data-jump]").forEach(button => button.addEventListener("click", () => setView(button.dataset.jump)));

  document.querySelectorAll(".print-mode-btn").forEach(button => button.addEventListener("click", () => {
    state.printSettings.printMode = button.dataset.printMode;
    saveState();
    applyPrintSettings();
    if (currentSeats.length) renderSeats();
  }));
  document.querySelectorAll(".orientation-btn").forEach(button => button.addEventListener("click", () => {
    state.printSettings.orientation = button.dataset.orientation;
    saveState();
    applyPrintSettings();
  }));
  document.querySelectorAll(".ng-zone-btn").forEach(button => button.addEventListener("click", () => {
    state.printSettings.ngZone = button.dataset.zone;
    saveState();
    applyPrintSettings();
    if (currentSeats.length) {
      renderSeats();
      showWarnings(countProblems(currentSeats, Number($("seatRows").value), Number($("seatCols").value)));
    }
  }));

  $("showNumberCheck").addEventListener("change", () => {
    state.printSettings.showNumber = $("showNumberCheck").checked;
    saveState();
    applyPrintSettings();
  });
  $("showGenderCheck").addEventListener("change", () => {
    state.printSettings.showGender = $("showGenderCheck").checked;
    saveState();
    applyPrintSettings();
  });

  $("schoolYearSelect").addEventListener("change", () => {
    state.currentYear = $("schoolYearSelect").value;
    const first = classesForCurrentYear()[0];
    if (first) state.currentClassId = first.id;
    currentSeats = currentClass().currentSeats || [];
    saveState();
    renderAll();
  });

  $("classSelect").addEventListener("change", () => {
    state.currentClassId = $("classSelect").value;
    currentSeats = currentClass().currentSeats || [];
    saveState();
    renderAll();
  });

  $("dashboardClassSearch").addEventListener("input", e => renderClassCards(e.target.value));
  $("classSearchInput").addEventListener("input", renderClassSearch);

  $("openClassModalBtn").addEventListener("click", () => {
    $("newClassYear").value = state.currentYear || "2026";
    $("classModal").classList.remove("hidden");
  });
  $("quickStartBtn").addEventListener("click", () => {
    $("newClassYear").value = state.currentYear || "2026";
    $("classModal").classList.remove("hidden");
  });
  $("closeClassModalBtn").addEventListener("click", () => $("classModal").classList.add("hidden"));
  $("createClassBtn").addEventListener("click", createClass);

  $("saveAllBtn").addEventListener("click", () => {
    saveState({ cloud: false });
    alert("この端末に保存しました。");
  });
  $("manualCloudSaveBtn").addEventListener("click", async () => {
    saveState({ cloud: false });
    if (!currentUser) return alert("クラウド保存にはGoogleログインが必要です。");
    try {
      await saveToCloud();
      alert("クラウド保存しました。");
    } catch (error) {
      console.error(error);
      updateSaveStatus("クラウド保存に失敗しました", "error");
      alert("クラウド保存に失敗しました。");
    }
  });
  $("manualCloudLoadBtn").addEventListener("click", async () => {
    if (!currentUser) return alert("クラウド読込にはGoogleログインが必要です。");
    const loaded = await loadFromCloud();
    alert(loaded ? "クラウドから読み込みました。" : "クラウド保存データはまだありません。");
  });
  $("loginBtn").addEventListener("click", loginWithGoogle);
  $("logoutBtn").addEventListener("click", logoutGoogle);

  $("addYearBtn").addEventListener("click", addYear);
  $("updateClassBtn").addEventListener("click", updateClassInfo);
  $("duplicateClassBtn").addEventListener("click", duplicateClass);
  $("deleteClassBtn").addEventListener("click", deleteCurrentClass);
  $("saveGenderBtn").addEventListener("click", saveGenders);
  $("addNgPairBtn").addEventListener("click", addNgPair);
  $("addCareMemoBtn").addEventListener("click", addCareMemo);

  $("generateSeatsBtn").addEventListener("click", () => createSeats("random"));
  $("balancedSeatsBtn").addEventListener("click", () => createSeats("balanced"));
  $("numberVerticalBtn").addEventListener("click", () => createSeats("numberVertical"));
  $("numberHorizontalBtn").addEventListener("click", () => createSeats("numberHorizontal"));
  $("genderVerticalBtn").addEventListener("click", () => createSeats("genderVertical"));
  $("genderHorizontalBtn").addEventListener("click", () => createSeats("genderHorizontal"));
  $("printSeatBtn").addEventListener("click", () => window.print());

  $("makeGroupsBtn").addEventListener("click", makeGroups);
  $("makeOrderBtn").addEventListener("click", makeOrder);
  $("copyOrderBtn").addEventListener("click", copyOrder);

  $("pickStudentBtn").addEventListener("click", pickStudent);
  $("resetPickerBtn").addEventListener("click", resetPicker);
  $("pickerGenderFilter").addEventListener("change", () => saveState());
  $("excludePickedCheck").addEventListener("change", () => saveState());
  $("skipAbsentCheck").addEventListener("change", () => saveState());

  $("startTimerBtn").addEventListener("click", startTimer);
  $("pauseTimerBtn").addEventListener("click", pauseTimer);
  $("resetTimerBtn").addEventListener("click", resetTimer);
  $("timerMinutes").addEventListener("change", resetTimer);
  $("timerSeconds").addEventListener("change", resetTimer);

  $("clearLocalBtn").addEventListener("click", () => {
    if (!confirm("この端末の保存データを削除しますか？")) return;
    localStorage.removeItem("laclass60LocalState");
    localStorage.removeItem("laclass40LocalState");
    location.reload();
  });
}

loadState();
currentSeats = currentClass().currentSeats || [];
bindEvents();
renderAll();
updateLoginUI();
updateSaveStatus(currentUser ? "ログイン中" : "未ログイン");
resetTimer();

onAuthStateChanged(auth, async (user) => {
  currentUser = user;
  updateLoginUI();
  updateSaveStatus(user ? "ログインしました" : "未ログイン");
  if (user) {
    try {
      await loadFromCloud();
    } catch (error) {
      console.error(error);
      updateLoginUI("クラウド読み込みに失敗しました。");
    }
  } else {
    currentSeats = currentClass().currentSeats || [];
    renderAll();
    updateLoginUI();
    updateSaveStatus("未ログイン");
  }
});

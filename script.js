const $ = (id) => document.getElementById(id);

let state = {
  currentClassId: null,
  classes: [],
  printSettings: {
    printMode: "posting",
    orientation: "portrait",
    showNumber: true,
    showGender: true,
    ngZone: "around"
  }
};

let currentSeats = [];
let draggedSeatIndex = null;

function uid() {
  return "id_" + Math.random().toString(36).slice(2, 10);
}

let currentUser = null;

function saveState() {
  localStorage.setItem("laclass30State", JSON.stringify(state));

  // Firebase連携後は、ログイン済みの場合だけFirestoreへ保存する想定です。
  // 現在はGitHub Pages用のデモなので、Googleログイン風の動作だけ入れています。
  if (currentUser) {
    localStorage.setItem("laclass30CloudDemo", JSON.stringify({
      uid: currentUser.uid,
      email: currentUser.email,
      savedAt: new Date().toISOString(),
      state
    }));
  }
}

function updateLoginUI() {
  const notice = $("loginNotice");
  const loginBtn = $("loginBtn");
  const logoutBtn = $("logoutBtn");

  if (!notice || !loginBtn || !logoutBtn) return;

  if (currentUser) {
    notice.classList.add("logged-in");
    notice.innerHTML = `<strong>ログイン中：</strong>${currentUser.email}　クラウド保存デモが有効です。`;
    loginBtn.classList.add("hidden");
    logoutBtn.classList.remove("hidden");
  } else {
    notice.classList.remove("logged-in");
    notice.innerHTML = `<strong>未ログインです。</strong>現在はこの端末だけに一時保存されます。クラウド保存を使うにはGoogleログインが必要です。`;
    loginBtn.classList.remove("hidden");
    logoutBtn.classList.add("hidden");
  }
}

function loginDemo() {
  currentUser = {
    uid: "demo-user",
    email: "teacher@example.com"
  };
  localStorage.setItem("laclass30UserDemo", JSON.stringify(currentUser));
  updateLoginUI();
  alert("Googleログインのデモです。本番ではFirebase Authenticationに接続します。");
}

function logoutDemo() {
  currentUser = null;
  localStorage.removeItem("laclass30UserDemo");
  updateLoginUI();
}

function loadState() {
  const saved = localStorage.getItem("laclass30State");
  if (saved) state = JSON.parse(saved);

  if (!state.printSettings) {
    state.printSettings = { printMode: "posting", orientation: "portrait", showNumber: true, showGender: true, ngZone: "around" };
  }
  if (!state.printSettings.printMode) state.printSettings.printMode = "posting";
  if (!state.printSettings.ngZone) state.printSettings.ngZone = "around";

  if (!state.classes || state.classes.length === 0) {
    const defaultClass = {
      id: uid(),
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
      currentSeats: []
    };

    defaultClass.students.forEach((name, index) => {
      defaultClass.genders[name] = index % 2 === 0 ? "男" : "女";
    });

    state.classes = [defaultClass];
    state.currentClassId = defaultClass.id;
    saveState();
  }

  if (!state.currentClassId) state.currentClassId = state.classes[0].id;

  state.classes.forEach(cls => {
    cls.genders = cls.genders || {};
    cls.ngPairs = cls.ngPairs || [];
    cls.careMemos = cls.careMemos || {};
    cls.lastSeats = cls.lastSeats || [];
    cls.currentSeats = cls.currentSeats || [];
  });
}

function currentClass() {
  return state.classes.find(c => c.id === state.currentClassId) || state.classes[0];
}

function getStudents() {
  return currentClass()?.students || [];
}

function studentNumber(name) {
  return getStudents().indexOf(name) + 1;
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
    seatView: "座席表",
    groupView: "班分け",
    orderView: "発表順",
    timerView: "タイマー",
    aiView: "AI支援",
    settingsView: "設定"
  };
  $("pageTitle").textContent = titles[viewId] || "LaClass";
}

function applyPrintSettings() {
  const area = $("printSeatArea");
  area.classList.remove("print-posting", "print-teacher", "portrait", "landscape");
  area.classList.add(`print-${state.printSettings.printMode}`);
  area.classList.add(state.printSettings.orientation);

  document.querySelectorAll(".print-mode-btn").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.printMode === state.printSettings.printMode);
  });
  document.querySelectorAll(".orientation-btn").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.orientation === state.printSettings.orientation);
  });
  document.querySelectorAll(".ng-zone-btn").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.zone === state.printSettings.ngZone);
  });

  $("showNumberCheck").checked = state.printSettings.showNumber;
  $("showGenderCheck").checked = state.printSettings.showGender;
  document.body.classList.toggle("hide-number", !state.printSettings.showNumber);
  document.body.classList.toggle("hide-gender", !state.printSettings.showGender);
}

function renderClassSelect() {
  $("classSelect").innerHTML = state.classes.map(c => `<option value="${c.id}">${c.name}</option>`).join("");
  $("classSelect").value = state.currentClassId;
}

function renderDashboard() {
  const cls = currentClass();
  $("studentCount").textContent = `${cls.students.length}人`;

  $("classCards").innerHTML = state.classes.map(c => `
    <div class="class-card" data-class-id="${c.id}">
      <h4>${c.name}</h4>
      <p>${c.students.length}人</p>
      <small>NGペア ${c.ngPairs?.length || 0}組 / 貼り出し・教卓対応</small>
    </div>
  `).join("");

  document.querySelectorAll(".class-card").forEach(card => {
    card.addEventListener("click", () => {
      state.currentClassId = card.dataset.classId;
      saveState();
      renderAll();
      setView("seatView");
    });
  });
}

function renderSettings() {
  const cls = currentClass();
  $("classNameInput").value = cls.name;
  $("studentInput").value = cls.students.join("\n");

  const options = cls.students.map(s => `<option value="${s}">${s}</option>`).join("");
  $("careStudentSelect").innerHTML = options;
  $("ngStudentA").innerHTML = options;
  $("ngStudentB").innerHTML = options;

  renderGenderList();
  renderCareMemos();
  renderNgPairs();
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
function removeCareMemo(name) { delete currentClass().careMemos[name]; saveState(); renderCareMemos(); }
function removeNgPair(index) { currentClass().ngPairs.splice(index, 1); saveState(); renderNgPairs(); }
window.removeCareMemo = removeCareMemo;
window.removeNgPair = removeNgPair;

function renderAll() {
  renderClassSelect();
  renderDashboard();
  renderSettings();
  applyPrintSettings();
  if (currentSeats.length) renderSeats();
}

function makeCards(title, items) {
  return `<div class="card"><h4>${title}</h4><ul>${items.map(i => `<li>${i}</li>`).join("")}</ul></div>`;
}

function seatFillIndexes(rows, cols, direction) {
  const indexes = [];
  if (direction === "vertical") {
    for (let c = 0; c < cols; c++) {
      for (let r = 0; r < rows; r++) indexes.push(r * cols + c);
    }
  } else {
    for (let i = 0; i < rows * cols; i++) indexes.push(i);
  }
  return indexes;
}

function displayIndexes(rows, cols) {
  const indexes = [];
  if (state.printSettings.printMode === "teacher") {
    for (let r = rows - 1; r >= 0; r--) {
      for (let c = 0; c < cols; c++) indexes.push(r * cols + c);
    }
  } else {
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) indexes.push(r * cols + c);
    }
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
    return cls.ngPairs.some(pair =>
      (pair[0] === name && pair[1] === other) ||
      (pair[1] === name && pair[0] === other)
    );
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

    div.addEventListener("dragover", (event) => event.preventDefault());

    div.addEventListener("drop", () => {
      if (draggedSeatIndex === null) return;
      const targetIndex = Number(div.dataset.index);
      [currentSeats[draggedSeatIndex], currentSeats[targetIndex]] = [currentSeats[targetIndex], currentSeats[draggedSeatIndex]];
      currentClass().currentSeats = currentSeats;
      saveState();
      renderSeats(rows, cols);
      showWarnings(countProblems(currentSeats, rows, cols));
    });

    chart.appendChild(div);
  });

  applyPrintSettings();
}

function createClass() {
  const name = $("newClassName").value.trim();
  const students = $("newClassStudents").value.split("\n").map(s => s.trim()).filter(Boolean);

  if (!name || students.length === 0) return alert("クラス名と名簿を入力してください。");

  const cls = { id: uid(), name, students, genders: {}, ngPairs: [], careMemos: {}, lastSeats: [], currentSeats: [] };
  state.classes.push(cls);
  state.currentClassId = cls.id;
  saveState();

  $("newClassName").value = "";
  $("newClassStudents").value = "";
  $("classModal").classList.add("hidden");

  renderAll();
  setView("settingsView");
}

function deleteCurrentClass() {
  if (state.classes.length <= 1) return alert("クラスは最低1つ必要です。");
  if (!confirm("現在のクラスを削除しますか？")) return;
  state.classes = state.classes.filter(c => c.id !== state.currentClassId);
  state.currentClassId = state.classes[0].id;
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
  cls.genders = cls.genders || {};
  cls.careMemos = cls.careMemos || {};
  cls.ngPairs = (cls.ngPairs || []).filter(pair => students.includes(pair[0]) && students.includes(pair[1]));

  Object.keys(cls.genders).forEach(name => { if (!students.includes(name)) delete cls.genders[name]; });
  Object.keys(cls.careMemos).forEach(name => { if (!students.includes(name)) delete cls.careMemos[name]; });

  saveState();
  renderAll();
  alert("更新しました。");
}

function saveGenders() {
  const cls = currentClass();
  document.querySelectorAll("[data-gender-name]").forEach(select => {
    const name = select.dataset.genderName;
    const value = select.value;
    if (value) cls.genders[name] = value;
    else delete cls.genders[name];
  });
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
  saveState();
  renderNgPairs();
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

function makeReport() {
  const k = $("reportKeywords").value.trim() || "授業に前向きに取り組み、友人の意見にも耳を傾ける姿";
  $("reportResult").textContent = `${k}が見られました。特に、活動の中で自分の考えを大切にしながら、周囲と協力して学ぼうとする姿勢が印象的でした。今後は、学んだことをさらに自分の言葉で表現し、日常生活の中でも生かしていくことを期待しています。`;
}

function makeNewsletter() {
  const topic = $("newsletterTopic").value.trim() || "今週の学び";
  $("newsletterResult").textContent = `【今週の学級通信】

今週の学級では、${topic}

子どもたちは活動を通して、自分の考えを言葉にすること、そして友人の考えを大切に聴くことに取り組みました。これからも、安心して学び合える学級づくりを大切にしていきます。`;
}

function makeLesson() {
  const subject = $("lessonSubject").value.trim() || "授業";
  const theme = $("lessonTheme").value.trim() || "テーマ";
  $("lessonResult").textContent = `【${subject}：${theme}の授業案】

1. 導入：問いを提示する「${theme}とは何か？」
2. 個人思考：自分の経験や考えを書く
3. ペア共有：相手の考えを傾聴する
4. 全体共有：多様な考えを板書する
5. まとめ：今日の気づきと明日からの行動を書く`;
}

function makeMail() {
  const topic = $("mailTopic").value.trim() || "学校での様子について共有したいこと";
  $("mailResult").textContent = `件名：学校でのご様子について

保護者様

いつもお世話になっております。
本日は、${topic} についてご連絡いたしました。

学校でも引き続き様子を見ながら支援してまいりますので、ご家庭でも可能な範囲でお声がけいただけますと幸いです。

どうぞよろしくお願いいたします。`;
}

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

  $("openClassModalBtn").addEventListener("click", () => $("classModal").classList.remove("hidden"));
  $("quickStartBtn").addEventListener("click", () => $("classModal").classList.remove("hidden"));
  $("closeClassModalBtn").addEventListener("click", () => $("classModal").classList.add("hidden"));
  $("createClassBtn").addEventListener("click", createClass);

  $("classSelect").addEventListener("change", () => {
    state.currentClassId = $("classSelect").value;
    saveState();
    currentSeats = currentClass().currentSeats || [];
    renderAll();
  });

  $("saveAllBtn").addEventListener("click", () => {
    if (!currentUser) {
      alert("保存にはGoogleログインが必要です。現在はこの端末だけに一時保存されています。");
      return;
    }
    saveState();
    alert("保存しました。");
  });

  $("loginBtn").addEventListener("click", loginDemo);
  $("logoutBtn").addEventListener("click", logoutDemo);

  $("generateSeatsBtn").addEventListener("click", () => createSeats("random"));
  $("balancedSeatsBtn").addEventListener("click", () => createSeats("balanced"));
  $("numberVerticalBtn").addEventListener("click", () => createSeats("numberVertical"));
  $("numberHorizontalBtn").addEventListener("click", () => createSeats("numberHorizontal"));
  $("genderVerticalBtn").addEventListener("click", () => createSeats("genderVertical"));
  $("genderHorizontalBtn").addEventListener("click", () => createSeats("genderHorizontal"));
  $("printSeatBtn").addEventListener("click", () => window.print());

  $("updateClassBtn").addEventListener("click", updateClassInfo);
  $("deleteClassBtn").addEventListener("click", deleteCurrentClass);
  $("saveGenderBtn").addEventListener("click", saveGenders);
  $("addNgPairBtn").addEventListener("click", addNgPair);

  $("addCareMemoBtn").addEventListener("click", () => {
    const student = $("careStudentSelect").value;
    const memo = $("careMemoInput").value.trim();
    if (!student || !memo) return alert("生徒名とメモを入力してください。");
    currentClass().careMemos[student] = memo;
    $("careMemoInput").value = "";
    saveState();
    renderCareMemos();
  });

  $("makeGroupsBtn").addEventListener("click", makeGroups);
  $("makeOrderBtn").addEventListener("click", makeOrder);
  $("copyOrderBtn").addEventListener("click", copyOrder);

  $("startTimerBtn").addEventListener("click", startTimer);
  $("pauseTimerBtn").addEventListener("click", pauseTimer);
  $("resetTimerBtn").addEventListener("click", resetTimer);
  $("timerMinutes").addEventListener("change", resetTimer);
  $("timerSeconds").addEventListener("change", resetTimer);

  $("makeReportBtn").addEventListener("click", makeReport);
  $("makeNewsletterBtn").addEventListener("click", makeNewsletter);
  $("makeLessonBtn").addEventListener("click", makeLesson);
  $("makeMailBtn").addEventListener("click", makeMail);
}

loadState();

const savedUser = localStorage.getItem("laclass30UserDemo");
if (savedUser) {
  currentUser = JSON.parse(savedUser);
}

currentSeats = currentClass().currentSeats || [];
bindEvents();
renderAll();
updateLoginUI();
resetTimer();

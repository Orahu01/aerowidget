const MAX_TRIES = 8;
const NUM_TOLERANCE = 3;
const PERIOD_TOLERANCE = 1;
const GROUP_TOLERANCE = 2;

const $ = (sel) => document.querySelector(sel);

const guessInput = $("#guessInput");
const suggestList = $("#suggestList");
const submitBtn = $("#submitGuess");
const giveUpBtn = $("#giveUpBtn");
const hintLine = $("#hintLine");
const guessRows = $("#guessRows");
const triesLeftEl = $("#triesLeft");
const dayBadge = $("#dayBadge");
const dayBadgeWrap = $("#dayBadgeWrap");
const streakValueEl = $("#streakValue");
const resultPanel = $("#resultPanel");
const resultTitle = $("#resultTitle");
const resultBody = $("#resultBody");
const shareBtn = $("#shareBtn");
const playAgainBtn = $("#playAgainBtn");
const statsBtn = $("#statsBtn");
const statsModal = $("#statsModal");
const statsClose = $("#statsClose");

let mode = "daily";
let activeIndex = -1;
let currentSuggestions = [];
let game = null;

function dayNumber(d) {
  const start = new Date(2024, 0, 1);
  const today = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  return Math.floor((today - start) / 86400000);
}

function elementByIndex(idx) {
  return ELEMENTS[((idx % ELEMENTS.length) + ELEMENTS.length) % ELEMENTS.length];
}

function storageKey(m) {
  return m === "daily" ? "elgame_daily_v1" : "elgame_random_v1";
}

function loadStats() {
  try {
    return JSON.parse(localStorage.getItem("elgame_stats_v1")) || { played: 0, wins: 0, streak: 0, maxStreak: 0, lastWinDay: null };
  } catch {
    return { played: 0, wins: 0, streak: 0, maxStreak: 0, lastWinDay: null };
  }
}

function saveStats(stats) {
  localStorage.setItem("elgame_stats_v1", JSON.stringify(stats));
}

function saveGame() {
  localStorage.setItem(
    storageKey(mode),
    JSON.stringify({
      seed: game.seed,
      targetNo: game.target.no,
      guesses: game.guesses.map((g) => g.no),
      status: game.status,
    })
  );
}

function newRandomTarget() {
  return ELEMENTS[Math.floor(Math.random() * ELEMENTS.length)];
}

function startGame(newMode, forceNew) {
  mode = newMode;
  document.querySelectorAll(".mode-btn").forEach((b) => {
    const active = b.dataset.mode === mode;
    b.classList.toggle("is-active", active);
    b.setAttribute("aria-selected", String(active));
  });
  dayBadgeWrap.style.display = mode === "daily" ? "flex" : "none";

  const today = new Date();
  const seed = mode === "daily" ? dayNumber(today) : null;

  let saved = null;
  if (!forceNew) {
    try {
      saved = JSON.parse(localStorage.getItem(storageKey(mode)));
    } catch {
      saved = null;
    }
  }

  const sameSeed = saved && (mode === "random" || saved.seed === seed);

  if (sameSeed && saved.status !== undefined) {
    const target = ELEMENTS.find((e) => e.no === saved.targetNo) || elementByIndex(seed);
    game = {
      seed,
      target,
      guesses: saved.guesses.map((no) => ELEMENTS.find((e) => e.no === no)).filter(Boolean),
      status: saved.status,
    };
  } else {
    const target = mode === "daily" ? elementByIndex(seed) : newRandomTarget();
    game = { seed, target, guesses: [], status: "playing" };
    saveGame();
  }

  dayBadge.textContent = mode === "daily" ? String(seed + 1) : "-";

  renderAll();
}

function renderAll() {
  guessRows.innerHTML = "";
  game.guesses.forEach((el) => addGuessRow(el, false));
  const left = MAX_TRIES - game.guesses.length;
  triesLeftEl.textContent = game.status === "playing" ? String(left) : "0";
  submitBtn.disabled = game.status !== "playing";
  guessInput.disabled = game.status !== "playing";
  hintLine.textContent = "";

  const stats = loadStats();
  streakValueEl.textContent = String(stats.streak);

  if (game.status !== "playing") {
    showResult();
  } else {
    resultPanel.hidden = true;
  }
}

function compareNumeric(guessVal, targetVal, tolerance) {
  if (guessVal === targetVal) return { cls: "hit", arrow: "" };
  const arrow = guessVal < targetVal ? "↑" : "↓";
  if (Math.abs(guessVal - targetVal) <= tolerance) return { cls: "close", arrow };
  return { cls: "miss", arrow };
}

function compareExact(guessVal, targetVal) {
  return guessVal === targetVal ? { cls: "hit" } : { cls: "miss" };
}

function buildComparisons(el) {
  const t = game.target;
  return {
    no: compareNumeric(el.no, t.no, NUM_TOLERANCE),
    period: compareNumeric(el.period, t.period, PERIOD_TOLERANCE),
    group: compareNumeric(el.group, t.group, GROUP_TOLERANCE),
    block: compareExact(el.block, t.block),
    cat: compareExact(el.cat, t.cat),
    state: compareExact(el.state, t.state),
  };
}

function addGuessRow(el) {
  const c = buildComparisons(el);
  const row = document.createElement("div");
  row.className = "guess-row";
  row.innerHTML = `
    <div class="cell elname">
      <div>${el.ja}</div>
      <div style="font-size:.72rem;color:var(--text-dim)">${el.en}</div>
    </div>
    <div class="cell c-sym ${el.no === game.target.no ? "hit" : "miss"}">${el.sym}</div>
    <div class="cell c-num ${c.no.cls}">${el.no}${c.no.arrow ? `<span class="arrow">${c.no.arrow}</span>` : ""}</div>
    <div class="cell c-per ${c.period.cls}">${el.period}${c.period.arrow ? `<span class="arrow">${c.period.arrow}</span>` : ""}</div>
    <div class="cell c-grp ${c.group.cls}">${el.group}${c.group.arrow ? `<span class="arrow">${c.group.arrow}</span>` : ""}</div>
    <div class="cell c-block ${c.block.cls}">${BLOCK_LABEL[el.block]}</div>
    <div class="cell c-cat ${c.cat.cls}">${CATEGORY_LABEL[el.cat]}</div>
    <div class="cell c-state ${c.state.cls}">${STATE_LABEL[el.state]}</div>
  `;
  guessRows.prepend(row);
  guessRows.scrollTop = 0;
}

function finishGame(status) {
  game.status = status;
  saveGame();
  if (mode === "daily") {
    const stats = loadStats();
    stats.played += 1;
    if (status === "won") {
      stats.wins += 1;
      if (stats.lastWinDay === game.seed - 1) {
        stats.streak += 1;
      } else {
        stats.streak = 1;
      }
      stats.lastWinDay = game.seed;
      stats.maxStreak = Math.max(stats.maxStreak, stats.streak);
    } else {
      stats.streak = 0;
    }
    saveStats(stats);
    streakValueEl.textContent = String(stats.streak);
  }
  showResult();
}

function buildShareGrid() {
  return game.guesses
    .map((el) => {
      const c = buildComparisons(el);
      const icon = (x) => (x.cls === "hit" ? "🟩" : x.cls === "close" ? "🟧" : "⬜");
      return [c.no, c.period, c.group, c.block, c.cat, c.state].map(icon).join("");
    })
    .join("\n");
}

function showResult() {
  resultPanel.hidden = false;
  if (game.status === "won") {
    resultTitle.textContent = `🎉 正解！ ${game.guesses.length}/${MAX_TRIES}`;
    resultBody.textContent = `答えは「${game.target.ja} (${game.target.sym})」でした。`;
  } else {
    resultTitle.textContent = "😢 残念...";
    resultBody.textContent = `正解は「${game.target.ja} (${game.target.sym})」でした。`;
  }
}

function handleGiveUp() {
  if (game.status !== "playing") return;
  finishGame("lost");
  renderAll();
}

function resolveGuessElement() {
  const raw = guessInput.value.trim();
  if (!raw) return null;
  if (activeIndex >= 0 && currentSuggestions[activeIndex]) return currentSuggestions[activeIndex];

  const lower = raw.toLowerCase();
  const exact = ELEMENTS.find(
    (e) => e.sym.toLowerCase() === lower || e.ja === raw || e.en.toLowerCase() === lower
  );
  if (exact) return exact;

  if (currentSuggestions.length === 1) return currentSuggestions[0];
  return null;
}

function submitGuess() {
  if (!game || game.status !== "playing") return;
  const el = resolveGuessElement();
  if (!el) {
    hintLine.textContent = "候補から元素を選択してください。";
    return;
  }
  if (game.guesses.some((g) => g.no === el.no)) {
    hintLine.textContent = "すでに予想した元素です。";
    return;
  }

  game.guesses.push(el);
  addGuessRow(el);
  guessInput.value = "";
  hintLine.textContent = "";
  hideSuggestions();

  const left = MAX_TRIES - game.guesses.length;
  triesLeftEl.textContent = String(Math.max(left, 0));

  if (el.no === game.target.no) {
    finishGame("won");
    submitBtn.disabled = true;
    guessInput.disabled = true;
  } else if (game.guesses.length >= MAX_TRIES) {
    finishGame("lost");
    submitBtn.disabled = true;
    guessInput.disabled = true;
  } else {
    saveGame();
  }
}

function searchElements(query) {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const scored = [];
  for (const el of ELEMENTS) {
    const sym = el.sym.toLowerCase();
    const en = el.en.toLowerCase();
    let score = -1;
    if (sym === q) score = 0;
    else if (el.ja === query.trim()) score = 0;
    else if (el.ja.startsWith(query.trim())) score = 1;
    else if (en.startsWith(q)) score = 2;
    else if (el.ja.includes(query.trim())) score = 3;
    else if (en.includes(q)) score = 4;
    else if (sym.startsWith(q)) score = 1;
    if (score >= 0) scored.push({ el, score });
  }
  scored.sort((a, b) => a.score - b.score || a.el.no - b.el.no);
  return scored.slice(0, 8).map((s) => s.el);
}

function renderSuggestions() {
  suggestList.innerHTML = "";
  if (!currentSuggestions.length) {
    suggestList.hidden = true;
    return;
  }
  currentSuggestions.forEach((el, i) => {
    const li = document.createElement("li");
    li.className = i === activeIndex ? "is-active" : "";
    li.innerHTML = `<span>${el.ja} <span style="color:var(--text-dim);font-size:.8rem">${el.en}</span></span><span class="sym-chip">${el.sym}</span>`;
    li.addEventListener("mousedown", (e) => {
      e.preventDefault();
      guessInput.value = el.ja;
      hideSuggestions();
    });
    suggestList.appendChild(li);
  });
  suggestList.hidden = false;
}

function hideSuggestions() {
  currentSuggestions = [];
  activeIndex = -1;
  suggestList.hidden = true;
  suggestList.innerHTML = "";
}

guessInput.addEventListener("input", () => {
  currentSuggestions = searchElements(guessInput.value);
  activeIndex = -1;
  renderSuggestions();
});

guessInput.addEventListener("keydown", (e) => {
  if (e.isComposing) return;
  if (e.key === "ArrowDown") {
    if (!currentSuggestions.length) return;
    e.preventDefault();
    activeIndex = (activeIndex + 1) % currentSuggestions.length;
    renderSuggestions();
  } else if (e.key === "ArrowUp") {
    if (!currentSuggestions.length) return;
    e.preventDefault();
    activeIndex = (activeIndex - 1 + currentSuggestions.length) % currentSuggestions.length;
    renderSuggestions();
  } else if (e.key === "Enter") {
    e.preventDefault();
    submitGuess();
  } else if (e.key === "Escape") {
    hideSuggestions();
  }
});

document.addEventListener("click", (e) => {
  if (!e.target.closest(".autocomplete")) hideSuggestions();
});

submitBtn.addEventListener("click", submitGuess);
giveUpBtn.addEventListener("click", handleGiveUp);

document.querySelectorAll(".mode-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    if (btn.dataset.mode === mode) return;
    startGame(btn.dataset.mode, false);
  });
});

playAgainBtn.addEventListener("click", () => {
  startGame("random", true);
  document.querySelectorAll(".mode-btn").forEach((b) => b.classList.toggle("is-active", b.dataset.mode === "random"));
});

shareBtn.addEventListener("click", async () => {
  const header =
    mode === "daily"
      ? `元素当てゲーム Day ${dayBadge.textContent} ${game.status === "won" ? game.guesses.length : "X"}/${MAX_TRIES}`
      : `元素当てゲーム (ランダム) ${game.status === "won" ? game.guesses.length : "X"}/${MAX_TRIES}`;
  const text = `${header}\n${buildShareGrid()}`;
  try {
    await navigator.clipboard.writeText(text);
    shareBtn.textContent = "コピーしました！";
  } catch {
    shareBtn.textContent = "コピーに失敗しました";
  }
  setTimeout(() => (shareBtn.textContent = "結果をコピー 📋"), 1800);
});

statsBtn.addEventListener("click", () => {
  const s = loadStats();
  $("#statPlayed").textContent = s.played;
  $("#statWinRate").textContent = s.played ? `${Math.round((s.wins / s.played) * 100)}%` : "0%";
  $("#statStreak").textContent = s.streak;
  $("#statMaxStreak").textContent = s.maxStreak;
  statsModal.hidden = false;
});
statsClose.addEventListener("click", () => (statsModal.hidden = true));
statsModal.addEventListener("click", (e) => {
  if (e.target === statsModal) statsModal.hidden = true;
});

startGame("daily", false);

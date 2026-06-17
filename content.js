/* content.js — Score Sync (MPP <-> Scorekeepr)
 * Panneau flottant + extraction / remplissage des scores. */
(function () {
  "use strict";

  if (window.__scoreSyncLoaded) return;
  window.__scoreSyncLoaded = true;

  const T = globalThis.ScoreSyncTeams;
  const HOST = location.hostname;
  const SITE = /scorekeepers\.uk$/.test(HOST) ? "scorekeepr"
             : /mpp\.football$/.test(HOST) ? "mpp"
             : /sauron\.chalco\.website$/.test(HOST) ? "sauron"
             : null;
  if (!SITE) return;

  const SITE_LABEL = { mpp: "MPP", scorekeepr: "Scorekeepr", sauron: "Sauron" };

  /* ------------------------------------------------------------------ */
  /* Utilitaires                                                         */
  /* ------------------------------------------------------------------ */

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  function toInt(v) {
    if (v == null) return null;
    const s = String(v).trim();
    if (s === "") return null;
    const n = parseInt(s, 10);
    return Number.isFinite(n) ? n : null;
  }

  // Écrit dans un input React/contrôlé en passant par le setter natif.
  function setNativeValue(input, value) {
    const proto = Object.getPrototypeOf(input);
    const desc = Object.getOwnPropertyDescriptor(proto, "value") ||
                 Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value");
    if (desc && desc.set) desc.set.call(input, String(value));
    else input.value = String(value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }

  /* ------------------------------------------------------------------ */
  /* Lecture des matchs présents sur la page                             */
  /* ------------------------------------------------------------------ */

  // -> [{ home, away, (homeInput, awayInput) | (homeScore, awayScore), validateBtn?, date? }]
  function readMatches() {
    if (SITE === "mpp") return readMpp();
    if (SITE === "sauron") return readSauron();
    return readScorekeepr();
  }

  // sauron.chalco.website : site de prédiction, scores déjà affichés en texte.
  function readSauron() {
    const matches = [];
    for (const card of document.querySelectorAll("article.card, .card")) {
      const h = card.querySelector(".team.h");
      const a = card.querySelector(".team.a");
      const sc = card.querySelector(".score");
      if (!h || !a || !sc) continue;
      const mm = sc.textContent.match(/(\d+)\s*[-:–]\s*(\d+)/);
      if (!mm) continue;
      matches.push({
        home: h.textContent.trim(),
        away: a.textContent.trim(),
        homeScore: +mm[1],
        awayScore: +mm[2]
      });
    }
    return matches;
  }

  function readMpp() {
    const inputs = Array.from(
      document.querySelectorAll('input[inputmode="numeric"][maxlength="2"]')
    );
    const seen = new Set();
    const matches = [];

    const isNameDiv = (d) =>
      /font-family:\s*Futura/i.test(d.getAttribute("style") || "");

    for (const input of inputs) {
      // Remonte jusqu'au plus petit conteneur ayant 2 noms + 2 inputs.
      let el = input, container = null;
      while (el && el.parentElement) {
        el = el.parentElement;
        const ins = el.querySelectorAll('input[inputmode="numeric"][maxlength="2"]');
        if (ins.length >= 2) {
          const names = Array.from(el.querySelectorAll("div")).filter(isNameDiv);
          if (names.length >= 2) { container = el; break; }
        }
      }
      if (!container || seen.has(container)) continue;
      seen.add(container);

      const names = Array.from(container.querySelectorAll("div")).filter(isNameDiv);
      const ins = Array.from(
        container.querySelectorAll('input[inputmode="numeric"][maxlength="2"]')
      );
      matches.push({
        home: names[0].textContent.trim(),
        away: names[1].textContent.trim(),
        homeInput: ins[0],
        awayInput: ins[1],
        validateBtn: null
      });
    }
    return matches;
  }

  function readScorekeepr() {
    const cards = Array.from(document.querySelectorAll(".match-card"));
    const matches = [];
    for (const card of cards) {
      const names = card.querySelectorAll(".team-name");
      const ins = card.querySelectorAll(".score-input");
      if (names.length < 2 || ins.length < 2) continue;
      const existing = parsePariExistant(card);
      const cd = card.querySelector(".countdown");
      matches.push({
        home: names[0].textContent.trim(),
        away: names[1].textContent.trim(),
        homeInput: ins[0],
        awayInput: ins[1],
        validateBtn: card.querySelector(".btn-pari"),
        card: card,
        filled: existing != null,                 // un pari a déjà été placé
        countdown: cd ? cd.textContent.replace(/\s+/g, " ").trim() : ""
      });
    }
    return matches;
  }

  // "Pari actuel : X-Y" -> {h, a} ; absent => null (match pas encore parié).
  function parsePariExistant(card) {
    const pe = card.querySelector(".pari-existant");
    if (!pe) return null;
    const m = pe.textContent.match(/(\d+)\s*[-–:]\s*(\d+)/);
    return m ? { h: +m[1], a: +m[2] } : null;
  }

  /* ------------------------------------------------------------------ */
  /* Extraction -> JSON                                                  */
  /* ------------------------------------------------------------------ */

  function extract() {
    const matches = readMatches()
      .map((m) => ({
        home: m.home,
        away: m.away,
        // Scores via inputs (mpp/scorekeepr) ou déjà en texte (sauron).
        homeScore: m.homeInput ? toInt(m.homeInput.value) : (m.homeScore ?? null),
        awayScore: m.awayInput ? toInt(m.awayInput.value) : (m.awayScore ?? null)
      }))
      // On exclut les paris non saisis (scores nuls/vides).
      .filter((m) => m.homeScore != null && m.awayScore != null);
    return { source: SITE, extractedAt: new Date().toISOString(), matches };
  }

  /* ------------------------------------------------------------------ */
  /* Remplissage depuis un JSON                                          */
  /* ------------------------------------------------------------------ */

  // Normalise un JSON d'entrée varié -> [{home, away, homeScore, awayScore}]
  function parseInput(raw) {
    let data = raw;
    if (typeof raw === "string") data = JSON.parse(raw);
    const arr = Array.isArray(data) ? data : (data && data.matches) || [];
    return arr.map((it) => {
      const home = it.home ?? it.team1 ?? it.homeTeam ?? it.h ?? "";
      const away = it.away ?? it.team2 ?? it.awayTeam ?? it.a ?? "";
      let hs = it.homeScore ?? it.scoreHome ?? it.h_score ?? it.hs;
      let as = it.awayScore ?? it.scoreAway ?? it.a_score ?? it.as;
      if ((hs == null || as == null) && typeof it.score === "string") {
        const mm = it.score.match(/(\d+)\s*[-:–]\s*(\d+)/);
        if (mm) { hs = +mm[1]; as = +mm[2]; }
      }
      return {
        home: String(home).trim(),
        away: String(away).trim(),
        homeScore: toInt(hs),
        awayScore: toInt(as)
      };
    }).filter((m) => m.home && m.away);
  }

  // Clé d'identité d'un match (équipes, ordre indifférent) pour ne pas
  // re-traiter un match déjà rempli quand la liste est re-rendue.
  function matchKey(home, away) {
    const a = T.codeOf(home) || T.normLoose(home);
    const b = T.codeOf(away) || T.normLoose(away);
    return [a, b].sort().join("::");
  }

  // Cherche, dans une lecture FRAÎCHE du DOM, le match correspondant à w.
  function findTarget(w, consumed) {
    const pageMatches = readMatches();
    for (const p of pageMatches) {
      const key = matchKey(p.home, p.away);
      if (consumed.has(key)) continue;
      if (T.teamsEqual(w.home, p.home) && T.teamsEqual(w.away, p.away)) {
        return { m: p, key, swapped: false };
      }
      if (T.teamsEqual(w.home, p.away) && T.teamsEqual(w.away, p.home)) {
        return { m: p, key, swapped: true };
      }
    }
    return null;
  }

  // Attend que le re-render JS soit terminé : le noeud cliqué est détaché
  // (liste reconstruite) ou, à défaut, un court délai de stabilisation.
  function waitForRerender(node, timeout = 2500) {
    return new Promise((resolve) => {
      const start = Date.now();
      (function check() {
        if (node && !document.contains(node)) return resolve(true);
        if (Date.now() - start > timeout) return resolve(false);
        setTimeout(check, 60);
      })();
    }).then(() => sleep(180)); // laisse le nouveau contenu se poser
  }

  async function fill(raw, onStep) {
    const wanted = parseInput(raw);
    const consumed = new Set();

    const filled = [];     // remplis (champ vide/neutre auparavant)
    const modified = [];   // modifiés (un score différent existait)
    const already = [];    // déjà au bon score (non touchés)
    const notFound = [];   // introuvables sur la page
    const skipped = [];    // scores manquants dans le JSON (paris nuls)

    // On ne tient compte que des vrais paris pour le total/compteur.
    const valid = wanted.filter((w) => {
      if (w.homeScore == null || w.awayScore == null) { skipped.push(w); return false; }
      return true;
    });

    const total = valid.length;
    let done = 0;
    const step = (label, status, score, live) => {
      if (onStep) onStep({ done, total, label, status, score, live });
    };

    for (const w of valid) {
      // Lecture fraîche à chaque itération : Scorekeepr reconstruit la liste
      // après chaque validation, donc les anciennes références sont périmées.
      const target = findTarget(w, consumed);
      if (!target) {
        notFound.push(w);
        done++;
        step(`${w.home} vs ${w.away}`, "introuvable");
        continue;
      }
      consumed.add(target.key);

      const p = target.m;
      const hScore = target.swapped ? w.awayScore : w.homeScore;
      const aScore = target.swapped ? w.homeScore : w.awayScore;
      const label = `${p.home} vs ${p.away}`;
      const scoreStr = `${hScore} – ${aScore}`;
      const rec = { home: p.home, away: p.away, homeScore: hScore, awayScore: aScore };

      // Déjà au bon score -> on ne touche à rien.
      const curH = toInt(p.homeInput.value);
      const curA = toInt(p.awayInput.value);
      if (curH === hScore && curA === aScore) {
        already.push(rec);
        done++;
        step(label, "déjà rempli", scoreStr);
        continue;
      }

      // Y avait-il déjà un pari ? Scorekeepr fournit l'info (p.filled) ;
      // sinon (MPP) on retombe sur l'heuristique du champ neutre (vide/0-0).
      const wasNeutral = (curH == null || curH === 0) && (curA == null || curA === 0);
      const hadBet = (p.filled === true) || (p.filled == null && !wasNeutral);
      step(label, hadBet ? "modification…" : "remplissage…", scoreStr, true);

      setNativeValue(p.homeInput, hScore);
      setNativeValue(p.awayInput, aScore);

      let validated = false;
      if (p.validateBtn) {                 // scorekeepr : valider + attendre le re-render
        p.validateBtn.click();
        validated = true;
        await waitForRerender(p.card);
      }
      rec.validated = validated;
      (hadBet ? modified : filled).push(rec);
      done++;
      step(label, hadBet ? "modifié" : "rempli", scoreStr);
    }

    return { site: SITE, total, filled, modified, already, notFound, skipped };
  }

  /* ------------------------------------------------------------------ */
  /* Interface (Shadow DOM)                                              */
  /* ------------------------------------------------------------------ */

  const CSS = `
  :host { all: initial; }
  * { box-sizing: border-box; font-family: -apple-system, "Segoe UI", Roboto, sans-serif; }
  .panel {
    position: fixed; top: 90px; right: 14px; z-index: 2147483647;
    width: 290px; max-height: 80vh; display: flex; flex-direction: column;
    background: rgba(20,20,26,.96); backdrop-filter: blur(10px);
    border: 1px solid rgba(184,148,30,.5); border-radius: 16px;
    box-shadow: 0 12px 40px rgba(0,0,0,.5); overflow: hidden;
    color: #eaeaf0;
  }
  .ssh-head {
    display: flex; align-items: center; gap: 9px; padding: 13px 15px;
    border-bottom: 1px solid rgba(255,255,255,.08);
    background: linear-gradient(135deg, rgba(184,148,30,.18), rgba(34,197,94,.08));
  }
  .ssh-head .logo { font-size: 18px; line-height: 1; }
  .ssh-head .title { font-size: 14px; font-weight: 700; letter-spacing: .2px; }
  .ssh-head .tag {
    margin-left: auto; font-size: 10px; font-weight: 700; letter-spacing: .5px;
    text-transform: uppercase; color: #b8941e; padding: 3px 8px;
    border: 1px solid rgba(184,148,30,.4); border-radius: 999px;
  }
  .ssh-body { padding: 14px 15px; display: flex; flex-direction: column; gap: 16px; overflow-y: auto; }
  .section-title {
    font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .6px;
    color: #9a9aab; margin-bottom: 9px;
  }
  .actions { display: flex; flex-direction: column; gap: 8px; }
  button {
    cursor: pointer; border: none; border-radius: 9px; padding: 9px 12px;
    font-size: 13px; font-weight: 600; color: #fff; transition: transform .08s, filter .15s;
    text-align: center;
  }
  button:active { transform: translateY(1px); }
  button:hover { filter: brightness(1.1); }
  button.act { width: 100%; }
  .btn-extract { background: linear-gradient(135deg,#2563eb,#3b82f6); }
  .btn-fill    { background: linear-gradient(135deg,#16a34a,#22c55e); }
  .btn-goto-page { width:100%; background: linear-gradient(135deg,#b8941e,#d4af37); color:#1a1a1a; }
  .empty { font-size: 12.5px; color: #9a9aab; line-height: 1.5; }

  .pending-banner {
    display: flex; align-items: center; gap: 10px; padding: 10px 12px;
    background: rgba(255,160,50,.12); border: 1px solid rgba(255,160,50,.45);
    border-radius: 11px;
  }
  .pending-banner .pb-text { flex: 1; font-size: 12.5px; font-weight: 700; color: #ffce8a; line-height: 1.35; }
  .pending-banner .pb-btn {
    flex: 0 0 auto; background: linear-gradient(135deg,#f59e0b,#fbbf24); color: #1a1a1a;
    padding: 8px 12px; font-size: 12.5px;
  }
  .pending-banner .pb-btn:disabled { opacity: .7; cursor: default; }

  .journee {
    display: flex; align-items: center; gap: 10px;
    padding: 9px 10px; background:#0d0d12; border-radius: 10px; margin-bottom: 7px;
    border: 1px solid rgba(255,255,255,.05);
  }
  .journee:last-child { margin-bottom: 0; }
  .journee .j-main { flex: 1; min-width: 0; }
  .journee .j-cd { font-size: 12.5px; font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .journee .j-counts { font-size: 11.5px; color: #9a9aab; margin-top: 2px; }
  .journee .j-counts .ok   { color:#4ade80; }
  .journee .j-counts .todo { color:#ffa032; }
  .journee.full { opacity: .75; }
  .journee.full .j-cd::before { content: "✓ "; color:#4ade80; }
  .j-goto {
    flex: 0 0 auto; width: 34px; height: 34px; padding: 0; font-size: 16px;
    background: linear-gradient(135deg,#16a34a,#22c55e); border-radius: 9px;
  }

  .overlay {
    position: fixed; inset: 0; z-index: 2147483647;
    background: rgba(0,0,0,.6); display: flex; align-items: center; justify-content: center;
  }
  .modal {
    width: min(640px, 92vw); max-height: 86vh; overflow: auto;
    background: #14141a; color: #eaeaf0; border: 1px solid rgba(184,148,30,.4);
    border-radius: 16px; padding: 20px; box-shadow: 0 20px 60px rgba(0,0,0,.6);
  }
  .modal.big { width: min(960px, 95vw); max-height: 92vh; }
  .modal.big textarea { min-height: 460px; max-height: 64vh; }
  .modal h2 { margin: 0 0 4px; font-size: 18px; }
  .modal .sub { margin: 0 0 14px; font-size: 13px; color: #9a9aab; }
  .search {
    width: 100%; padding: 10px 12px; border-radius: 10px; margin-bottom: 8px;
    background: #0d0d12; color: #eaeaf0; border: 1px solid #2a2a36; font-size: 13px;
  }
  .search:focus { outline: none; border-color: rgba(184,148,30,.7); }
  .count { font-size: 12px; color: #9a9aab; margin-bottom: 8px; }
  textarea {
    width: 100%; min-height: 200px; resize: vertical; border-radius: 10px;
    background: #0d0d12; color: #d7f7e3; border: 1px solid #2a2a36; padding: 12px;
    font-family: "SF Mono", Menlo, Consolas, monospace; font-size: 12.5px; line-height: 1.5;
  }
  .row { display: flex; gap: 10px; margin-top: 14px; flex-wrap: wrap; }
  .row.end { justify-content: flex-end; }
  .modal button.ghost { background: #2a2a36; }
  .report { margin-top: 14px; }
  .stat { display:flex; gap:10px; flex-wrap:wrap; margin-bottom:12px; }
  .pill { padding:6px 12px; border-radius:999px; font-size:13px; font-weight:600; }
  .pill.ok   { background: rgba(34,197,94,.18); color:#4ade80; }
  .pill.mod  { background: rgba(59,130,246,.18); color:#60a5fa; }
  .pill.same { background: rgba(148,163,184,.18); color:#cbd5e1; }
  .pill.warn { background: rgba(255,160,50,.18); color:#ffa032; }
  .pill.skip { background: rgba(148,163,184,.18); color:#cbd5e1; }

  .live {
    margin-top: 14px; padding: 10px 12px; border-radius: 10px;
    background:#0d0d12; border:1px solid #2a2a36; font-size: 13px;
    display:flex; align-items:center; gap:10px;
  }
  .live .dot {
    width: 9px; height: 9px; border-radius: 50%; background:#22c55e; flex:0 0 auto;
    box-shadow: 0 0 0 0 rgba(34,197,94,.6); animation: pulse 1.1s infinite;
  }
  @keyframes pulse {
    0%   { box-shadow: 0 0 0 0 rgba(34,197,94,.6); }
    70%  { box-shadow: 0 0 0 7px rgba(34,197,94,0); }
    100% { box-shadow: 0 0 0 0 rgba(34,197,94,0); }
  }
  .live .lbl { flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .live .st  { color:#9a9aab; font-size:12px; white-space:nowrap; }
  .live .sc  { color:#b8941e; font-weight:700; white-space:nowrap; }
  .live.done .dot { animation:none; background:#3b82f6; }
  .list { margin: 0; padding: 0; list-style: none; }
  .list li {
    padding: 8px 10px; border-radius: 8px; background:#0d0d12; margin-bottom: 6px; font-size: 13px;
    display:flex; justify-content:space-between; align-items:center; gap:10px;
  }
  .list li .score { color:#b8941e; font-weight:700; white-space:nowrap; }
  .list li.miss { border-left: 3px solid #ffa032; }
  .list li.mod  { border-left: 3px solid #60a5fa; }
  .list li.same { border-left: 3px solid #475569; opacity:.8; }
  .secT { font-size: 12px; text-transform: uppercase; letter-spacing:.5px; color:#9a9aab; margin: 14px 0 6px; }
  .close { background:#2a2a36; }
  .toast {
    position: fixed; bottom: 22px; left: 50%; transform: translateX(-50%);
    background:#16a34a; color:#fff; padding:10px 18px; border-radius:10px; font-size:13px;
    z-index:2147483647; box-shadow:0 8px 24px rgba(0,0,0,.4); font-weight:600;
  }
  `;

  const root = document.createElement("div");
  root.id = "score-sync-host";
  const shadow = root.attachShadow({ mode: "open" });
  const style = document.createElement("style");
  style.textContent = CSS;
  shadow.appendChild(style);
  document.documentElement.appendChild(root);

  // Garde le panneau présent malgré les re-rendus SPA.
  const ensure = () => {
    if (!document.documentElement.contains(root)) {
      document.documentElement.appendChild(root);
    }
  };
  new MutationObserver(ensure).observe(document.documentElement, {
    childList: true, subtree: false
  });

  // Panneau (card) — re-rendu selon le site et l'état de la page.
  const panel = document.createElement("div");
  panel.className = "panel";
  shadow.appendChild(panel);

  let busy = false; // true pendant un remplissage : évite les re-renders parasites

  const isVisible = (el) => !!(el && el.offsetParent !== null);

  // Sur Scorekeepr, la page des pronos est reconnaissable à ses inputs de score visibles.
  function onScoresPage() {
    if (SITE !== "scorekeepr") return true;
    return isVisible(document.querySelector(".score-input"));
  }

  function findParisTab() {
    return Array.from(document.querySelectorAll("button")).find((b) =>
      /switchTab\(\s*['"]paris['"]\s*\)/.test(b.getAttribute("onclick") || "")
    );
  }
  function clickParisTab() {
    const b = findParisTab();
    if (!b) return false;
    if (!b.classList.contains("active")) b.click();
    return true;
  }
  // Clique l'onglet Pronos (si pas déjà actif) puis l'onglet Paris.
  async function gotoParis() {
    const link = document.querySelector('a[href*="matchs.html"]');
    if (link && !link.classList.contains("active") && !findParisTab()) {
      sessionStorage.setItem("ssh_goto_paris", "1"); // au cas où le clic recharge la page
      link.click();
      await sleep(450);
    }
    clickParisTab();
    sessionStorage.removeItem("ssh_goto_paris");
    setTimeout(renderPanel, 350);
  }

  function cdMinutes(t) {
    let total = 0, found = false;
    const j = t.match(/(\d+)\s*j/);   if (j) { total += +j[1] * 1440; found = true; }
    const h = t.match(/(\d+)\s*h/);   if (h) { total += +h[1] * 60;   found = true; }
    const m = t.match(/(\d+)\s*min/); if (m) { total += +m[1];        found = true; }
    return found ? total : Infinity;
  }

  // Regroupe les matchs par countdown (= journée) ; compte remplis / à remplir.
  function getJournees() {
    const cards = Array.from(document.querySelectorAll(".match-card"));
    const map = new Map();
    for (const card of cards) {
      const ins = card.querySelectorAll(".score-input");
      if (ins.length < 2 || !isVisible(ins[0])) continue;
      const cdEl = card.querySelector(".countdown");
      const cd = cdEl ? cdEl.textContent.replace(/\s+/g, " ").trim() : "Sans échéance";
      if (!map.has(cd)) map.set(cd, { cd, filled: 0, todo: 0, firstTodo: null });
      const g = map.get(cd);
      if (parsePariExistant(card)) g.filled++;
      else { g.todo++; if (!g.firstTodo) g.firstTodo = card; }
    }
    return Array.from(map.values()).sort((a, b) => cdMinutes(a.cd) - cdMinutes(b.cd));
  }

  // Matchs avec un score saisi mais pas encore validé (input ≠ pari placé).
  function getPending() {
    const out = [];
    for (const card of document.querySelectorAll(".match-card")) {
      const ins = card.querySelectorAll(".score-input");
      if (ins.length < 2 || !isVisible(ins[0])) continue;
      const curH = toInt(ins[0].value), curA = toInt(ins[1].value);
      if (curH == null || curA == null) continue;          // pas (entièrement) saisi
      const placed = parsePariExistant(card);
      if (placed && placed.h === curH && placed.a === curA) continue; // déjà validé tel quel
      const btn = card.querySelector(".btn-pari");
      if (btn) out.push({ card, btn });
    }
    return out;
  }

  // Valide toutes les saisies en attente (clic + attente du re-render à chaque fois).
  async function validateAllPending(onStep) {
    let count = 0, guard = 0;
    while (guard++ < 300) {
      const pend = getPending();
      if (!pend.length) break;
      if (onStep) onStep(count + 1, count + pend.length);
      const p = pend[0];
      p.btn.click();
      await waitForRerender(p.card);
      count++;
    }
    return count;
  }

  // Défile jusqu'à un match et le met brièvement en évidence.
  function flashCard(card) {
    if (!card) return;
    card.scrollIntoView({ behavior: "smooth", block: "center" });
    const prev = card.style.boxShadow;
    card.style.transition = "box-shadow .3s";
    card.style.boxShadow = "0 0 0 3px #22c55e";
    setTimeout(() => { card.style.boxShadow = prev; }, 1700);
    const inp = card.querySelector(".score-input");
    if (inp) setTimeout(() => inp.focus(), 450);
  }

  function renderPanel() {
    const tag = SITE === "mpp" ? "MPP" : SITE === "sauron" ? "Sauron" : "SK";
    const head =
      `<div class="ssh-head">` +
      `<span class="logo">⚽</span><span class="title">ScoreKeeper Helper</span>` +
      `<span class="tag">${tag}</span></div>`;

    let body = "";
    if (SITE === "sauron") {
      body =
        `<div class="actions">` +
        `<button class="act btn-extract" data-action="extract">⬇️ Extraire scores</button>` +
        `</div>`;
    } else if (SITE === "mpp") {
      body =
        `<div class="actions">` +
        `<button class="act btn-extract" data-action="extract">⬇️ Extraire scores</button>` +
        `<button class="act btn-fill" data-action="fill">⬆️ Remplir scores depuis Scorekeeper</button>` +
        `</div>`;
    } else if (!onScoresPage()) {
      body =
        `<div class="empty">Va sur la page des pronos pour extraire ou remplir les scores.</div>` +
        `<button class="btn-goto-page" data-action="goto-page">📅 Aller sur la page des pronos</button>`;
    } else {
      const pending = getPending();
      if (pending.length) {
        body +=
          `<div class="pending-banner">` +
          `<span class="pb-text">⏳ ${pending.length} pari(s) en attente de validation</span>` +
          `<button class="pb-btn" data-action="validate-all">Tout valider</button>` +
          `</div>`;
      }

      body +=
        `<div class="section">` +
        `<div class="section-title">Compatibilité MPP</div>` +
        `<div class="actions">` +
        `<button class="act btn-extract" data-action="extract">⬇️ Extraire scores</button>` +
        `<button class="act btn-fill" data-action="fill">⬆️ Remplir scores depuis MPP</button>` +
        `</div></div>`;

      const journees = getJournees();
      let jhtml;
      if (!journees.length) {
        jhtml = `<div class="empty">Aucun match détecté.</div>`;
      } else {
        jhtml = "";
        for (const g of journees) {
          const full = g.todo === 0;
          jhtml +=
            `<div class="journee ${full ? "full" : ""}">` +
            `<div class="j-main">` +
            `<div class="j-cd">${esc(g.cd)}</div>` +
            `<div class="j-counts"><span class="ok">${g.filled} rempli(s)</span> · ` +
            `<span class="todo">${g.todo} à remplir</span></div>` +
            `</div>` +
            (full ? ""
              : `<button class="j-goto" data-action="goto-journee" data-cd="${esc(g.cd)}" ` +
                `title="Aller au 1er match à remplir">↧</button>`) +
            `</div>`;
        }
      }
      body += `<div class="section"><div class="section-title">À remplir</div>${jhtml}</div>`;
    }
    panel.innerHTML = head + `<div class="ssh-body">${body}</div>`;
  }

  // Délégation des clics du panneau (le contenu est ré-généré dynamiquement).
  panel.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-action]");
    if (!btn) return;
    const a = btn.getAttribute("data-action");
    if (a === "extract") openExtract();
    else if (a === "fill") openFill();
    else if (a === "goto-page") gotoParis();
    else if (a === "goto-journee") {
      const g = getJournees().find((x) => x.cd === btn.getAttribute("data-cd"));
      flashCard(g && g.firstTodo);
    } else if (a === "validate-all") {
      validateAll(btn);
    }
  });

  async function validateAll(btn) {
    busy = true;                       // gèle le re-render du panneau pendant l'opération
    btn.disabled = true;
    try {
      const n = await validateAllPending((done, total) => {
        btn.textContent = `⏳ ${done}/${total}...`;
      });
      toast(`${n} pari(s) validé(s) ✔`);
    } catch (e) {
      toast("Erreur lors de la validation");
    } finally {
      busy = false;
      lastSig = panelSignature();
      renderPanel();
    }
  }

  // Signature de l'état affiché : évite de re-render à chaque tic du DOM.
  function panelSignature() {
    if (SITE !== "scorekeepr") return "mpp";
    if (!onScoresPage()) return "no-page";
    const j = getJournees().map((g) => `${g.cd}|${g.filled}|${g.todo}`).join("~");
    return `p${getPending().length}~${j}`;
  }
  let lastSig = panelSignature();
  renderPanel();

  // Re-render seulement si l'état pertinent a changé (débouncé).
  let renderTimer = null;
  function scheduleRender() {
    if (busy) return;
    clearTimeout(renderTimer);
    renderTimer = setTimeout(() => {
      if (busy) return;
      const sig = panelSignature();
      if (sig !== lastSig) { lastSig = sig; renderPanel(); }
    }, 300);
  }

  // Scorekeepr : re-render quand l'état pertinent change (onglets, paris validés…),
  // et quand l'utilisateur saisit un score (détection des paris en attente).
  if (SITE === "scorekeepr") {
    new MutationObserver(scheduleRender).observe(document.body, { childList: true, subtree: true });
    document.addEventListener("input", (e) => {
      const t = e.target;
      if (t && t.classList && t.classList.contains("score-input")) scheduleRender();
    }, true);

    // Reprise après une navigation déclenchée par "Aller aux pronos".
    if (sessionStorage.getItem("ssh_goto_paris")) {
      setTimeout(() => {
        clickParisTab();
        sessionStorage.removeItem("ssh_goto_paris");
        renderPanel();
      }, 500);
    }
  }

  function toast(msg) {
    const t = document.createElement("div");
    t.className = "toast";
    t.textContent = msg;
    shadow.appendChild(t);
    setTimeout(() => t.remove(), 2200);
  }

  function openModal(buildBody) {
    const overlay = document.createElement("div");
    overlay.className = "overlay";
    const modal = document.createElement("div");
    modal.className = "modal";
    overlay.appendChild(modal);
    shadow.appendChild(overlay);
    const close = () => overlay.remove();
    overlay.addEventListener("mousedown", (e) => { if (e.target === overlay) close(); });
    buildBody(modal, close);
    return { modal, close };
  }

  function esc(s) {
    return String(s).replace(/[&<>"]/g, (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  }

  /* ----- Extraire ----- */
  // Normalisation pour la recherche : minuscules, sans accents (garde chiffres/espaces).
  function searchNorm(s) {
    return String(s).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  }

  function openExtract() {
    const all = extract().matches;                 // tableau de matchs (ordre conservé)
    const fullJson = JSON.stringify(all, null, 2);
    openModal((modal, close) => {
      modal.classList.add("big");
      modal.innerHTML = `
        <h2>Scores extraits — ${SITE_LABEL[SITE]}</h2>
        <p class="sub">${all.length} match(s) détecté(s). Copie ce JSON puis colle-le sur l'autre site.</p>
        <input class="search" type="text" placeholder="🔍 Rechercher (équipe, score…)">
        <div class="count"></div>
        <textarea readonly></textarea>
        <div class="row end">
          <button class="ghost close">Fermer</button>
          <button class="btn-extract copy">📋 Copier le JSON</button>
        </div>`;
      const ta = modal.querySelector("textarea");
      const search = modal.querySelector(".search");
      const count = modal.querySelector(".count");

      const render = (q) => {
        const term = searchNorm(q).trim();
        const list = term
          ? all.filter((m) =>
              searchNorm(`${m.home} ${m.away} ${m.homeScore}-${m.awayScore}`).includes(term))
          : all;
        ta.value = JSON.stringify(list, null, 2);
        count.textContent = term
          ? `${list.length} / ${all.length} match(s) — copie le résultat filtré`
          : `${all.length} match(s)`;
      };
      render("");

      search.addEventListener("input", () => render(search.value));
      ta.addEventListener("focus", () => ta.select());
      modal.querySelector(".close").addEventListener("click", close);
      modal.querySelector(".copy").addEventListener("click", async () => {
        const txt = ta.value;                        // copie ce qui est affiché (filtré ou non)
        try { await navigator.clipboard.writeText(txt); toast("JSON copié ✔"); }
        catch { ta.select(); document.execCommand("copy"); toast("JSON copié ✔"); }
      });
      // Copie automatique de tout, pour le cas courant.
      navigator.clipboard && navigator.clipboard.writeText(fullJson).catch(() => {});
    });
  }

  /* ----- Remplir ----- */
  function openFill() {
    openModal((modal, close) => {
      modal.innerHTML = `
        <h2>Remplir les scores — ${SITE_LABEL[SITE]}</h2>
        <p class="sub">Colle le JSON extrait depuis l'autre site${
          SITE === "scorekeepr" ? ", chaque pari sera validé automatiquement." : "."
        }</p>
        <textarea placeholder='[ { "home": "...", "away": "...", "homeScore": 2, "awayScore": 0 } ]'></textarea>
        <div class="row end">
          <button class="ghost close">Annuler</button>
          <button class="btn-fill go">▶️ Remplir</button>
        </div>
        <div class="live" hidden></div>
        <div class="report"></div>`;
      const ta = modal.querySelector("textarea");
      const live = modal.querySelector(".live");
      const report = modal.querySelector(".report");
      modal.querySelector(".close").addEventListener("click", close);
      const goBtn = modal.querySelector(".go");

      goBtn.addEventListener("click", async () => {
        let parsed;
        try { parsed = ta.value.trim(); JSON.parse(parsed); }
        catch (e) {
          report.innerHTML = `<div class="pill warn">JSON invalide : ${esc(e.message)}</div>`;
          return;
        }
        goBtn.disabled = true;
        goBtn.textContent = "⏳ Remplissage...";
        report.innerHTML = "";
        live.hidden = false;
        live.classList.remove("done");
        busy = true; // gèle le re-render du panneau pendant le remplissage
        try {
          const res = await fill(parsed, (u) => {
            goBtn.textContent = `⏳ ${u.done}/${u.total}...`;
            live.innerHTML =
              `<span class="dot"></span>` +
              `<span class="lbl">${esc(u.label)}</span>` +
              `<span class="st">${esc(u.status)}</span>` +
              (u.score ? `<span class="sc">${esc(u.score)}</span>` : "");
          });
          live.classList.add("done");
          live.innerHTML =
            `<span class="dot"></span><span class="lbl">Terminé</span>` +
            `<span class="st">${res.total} pari(s) traité(s)</span>`;
          renderReport(report, res);
        } catch (e) {
          live.hidden = true;
          report.innerHTML = `<div class="pill warn">Erreur : ${esc(e.message)}</div>`;
        } finally {
          busy = false;
          renderPanel(); // rafraîchit les compteurs "À remplir"
          goBtn.disabled = false;
          goBtn.textContent = "▶️ Remplir à nouveau";
        }
      });
    });
  }

  function renderReport(container, res) {
    const validSuffix = res.site === "scorekeepr" ? " ✓" : "";
    const row = (m, cls, withScore) => {
      const score = withScore
        ? `<span class="score">${m.homeScore} – ${m.awayScore}${m.validated ? validSuffix : ""}</span>`
        : "";
      return `<li class="${cls || ""}"><span>${esc(m.home)} <b>vs</b> ${esc(m.away)}</span>${score}</li>`;
    };
    const section = (title, arr, cls, withScore = true) => {
      if (!arr.length) return "";
      let h = `<div class="secT">${title}</div><ul class="list">`;
      for (const m of arr) h += row(m, cls, withScore);
      return h + `</ul>`;
    };

    let html = `<div class="stat">
      <span class="pill ok">✔ ${res.filled.length} rempli(s)</span>
      <span class="pill mod">✎ ${res.modified.length} modifié(s)</span>
      <span class="pill same">= ${res.already.length} déjà rempli(s)</span>`;
    if (res.notFound.length) html += `<span class="pill warn">✖ ${res.notFound.length} non trouvé(s)</span>`;
    if (res.skipped.length) html += `<span class="pill skip">– ${res.skipped.length} sans score</span>`;
    html += `</div>`;

    html += section("Remplis", res.filled);
    html += section("Modifiés", res.modified, "mod");
    html += section("Déjà au bon score (non touchés)", res.already, "same");
    html += section("Non trouvés sur cette page", res.notFound, "miss");
    html += section("Ignorés (score manquant dans le JSON)", res.skipped, "", false);

    container.innerHTML = html;
  }
})();



"use strict";

const $ = (id) => document.getElementById(id);
const REDUCED = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const beat = (ms) => new Promise((r) => setTimeout(r, REDUCED ? 0 : ms));

const state = {
  scenarios: [],
  selected: "honest",
  ledger: [],
  spec: null,
  running: false,
};

const usd = (cents) => "$" + (Number(cents || 0) / 100).toFixed(2);

const CHECK_ORDER = ["compiles", "tests", "latency", "schema"];
const PENDING_LABELS = {
  compiles: { label: "Code compiles", detail: "pending" },
  tests: { label: "Unit tests", detail: "· / ·" },
  latency: { label: "Latency p95", detail: "pending" },
  schema: { label: "Output schema", detail: "pending" },
};

async function api(path, opts) {
  const res = await fetch(path, opts);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body && body.error ? body.error : `${res.status} ${res.statusText}`);
  return body;
}
const jpost = (path, data) =>
  api(path, {
    method: "POST",
    headers: data ? { "content-type": "application/json" } : undefined,
    body: data ? JSON.stringify(data) : undefined,
  });

async function requestTask() {
  const res = await fetch("/api/tasks", { method: "POST" });
  const body = await res.json().catch(() => ({}));
  if (!res.ok && res.status !== 402) {
    throw new Error(body && body.error ? body.error : `${res.status} ${res.statusText}`);
  }
  return body; 
}

async function boot() {
  try {
    const s = await api("/api/state");
    state.spec = s.spec;
    state.scenarios = s.scenarios || [];
    state.ledger = s.ledger || [];

    renderSpec(s.spec);
    renderProviders(s.scenarios);
    renderTally(s.stats);
    renderLedger(state.ledger, null);
    primeReceipt(s.spec);
  } catch (err) {
    console.error(err);
    $("pact-task").textContent = "Could not reach the TokenPact server. Is it running?";
  }

  $("run").addEventListener("click", runPact);
  $("peek").addEventListener("click", toggleCode);
  const clearBtn = $("clear-ledger");
  if (clearBtn) {
    clearBtn.addEventListener("click", async () => {
      try {
        const res = await jpost("/api/reset");
        state.ledger = res.ledger || [];
        renderLedger(state.ledger, null);
        renderTally(res.stats);
      } catch (err) {
        console.error("Failed to reset ledger:", err);
      }
    });
  }
}

function renderSpec(spec) {
  if (!spec) return;
  $("pact-title").textContent = spec.title;
  $("pact-task").textContent = spec.task;
  $("pact-accept").textContent = spec.acceptIf.humanExpr;
  $("pact-price").textContent = usd(spec.priceCents);
  $("seal-amount").textContent = usd(spec.priceCents);
}

const TAGS = { honest: "honest agent", faulty: "faulty agent", slow: "slow agent" };

function renderProviders(scenarios) {
  const wrap = $("providers");
  wrap.innerHTML = "";
  scenarios.forEach((sc, i) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "provider";
    btn.setAttribute("role", "radio");
    btn.setAttribute("aria-checked", String(sc.id === state.selected));
    btn.dataset.id = sc.id;
    btn.innerHTML =
      `<span class="pv-mark" aria-hidden="true"></span>` +
      `<span class="pv-body">` +
      `<span class="pv-name">${esc(sc.name)}</span>` +
      `<span class="pv-desc">${esc(sc.headline)}</span>` +
      `<span class="pv-tag">${esc(TAGS[sc.id] || sc.id)}</span>` +
      `</span>`;
    btn.addEventListener("click", () => selectProvider(sc.id));
    wrap.appendChild(btn);
  });
}

function selectProvider(id) {
  if (state.running) return;
  state.selected = id;
  document.querySelectorAll(".provider").forEach((el) => {
    el.setAttribute("aria-checked", String(el.dataset.id === id));
  });
}

function renderTally(stats) {
  if (!stats) return;
  $("tally-released").textContent = usd(stats.releasedCents);
  $("tally-protected").textContent = usd(stats.protectedCents);
  $("tally-settled").textContent = String(stats.settled);
}

function primeReceipt(spec) {
  const ul = $("checks");
  ul.innerHTML = "";
  const total = spec ? spec.tests.length : "·";
  const budget = spec ? spec.acceptIf.p95BudgetMs : 50;
  const schema = spec ? spec.acceptIf.schema : "boolean";
  const seed = {
    compiles: PENDING_LABELS.compiles,
    tests: { label: "Unit tests", detail: `· / ${total}` },
    latency: { label: `Latency p95 < ${budget}ms`, detail: "pending" },
    schema: { label: "Output schema", detail: schema },
  };
  CHECK_ORDER.forEach((id) => {
    ul.appendChild(checkRow(id, seed[id].label, seed[id].detail, "pending", true));
  });
  $("receipt").hidden = false;
}

function checkRow(id, label, detail, status, shown) {
  const li = document.createElement("li");
  li.className = "check " + status + (shown ? " in" : "");
  li.dataset.id = id;
  const box = status === "pass" ? "✓" : status === "fail" ? "✗" : "▫";
  li.innerHTML =
    `<span class="check-box">${box}</span>` +
    `<span class="check-label">${esc(label)}</span>` +
    `<span class="check-detail">${esc(detail)}</span>`;
  return li;
}

async function runPact() {
  if (state.running) return;
  state.running = true;
  setRunning(true);
  resetVault();

  const scenario = state.selected;

  try {
    
    setStep("intent", "active");
    const gate = await requestTask();
    const created = gate.transaction;
    const offer = gate.offer || (gate.accepts && gate.accepts[0]);
    $("tx-id").textContent = created.id;
    showOffer(offer);
    setChip("idle", "402 · payment required");
    setSeal("idle", offer ? offer.amountCents : created.amountCents, "402");
    await beat(680);

    const funded = (await jpost(`/api/tasks/${created.id}/pay`)).transaction;
    markOfferPaid(funded);
    setSeal("held", funded.amountCents, "in escrow");
    setChip("held", "Held in escrow");
    await beat(560);
    setStep("intent", "done");

    setStep("execution", "active");
    const produced = (await jpost(`/api/tasks/${created.id}/produce`, { scenario })).transaction;
    showProvider(produced.provider);
    await beat(560);

    resetChecksToPending();
    const verified = await jpost(`/api/tasks/${created.id}/verify`);
    const tx = verified.transaction;
    const v = tx.verification;

    for (const id of CHECK_ORDER) {
      const c = v.checks.find((x) => x.id === id);
      if (c) await revealCheck(c);
      await beat(300);
    }

    $("sig-val").textContent = v.signature;
    $("receipt-foot").hidden = false;
    await beat(260);
    setStep("execution", "done");

    setStep("settlement", "active");
    const released = tx.escrow === "RELEASED";
    stampSeal(released, tx.amountCents);
    setChip(released ? "released" : "refunded", released ? "Released to provider" : "Refunded to buyer");
    showSettlement(tx);
    setStep("settlement", "done");

    renderTally(verified.stats);
    state.ledger.unshift(tx);
    renderLedger(state.ledger, tx.id);
  } catch (err) {
    console.error(err);
    setChip("refunded", "Error — see console");
    $("tx-id").textContent = "failed";
  } finally {
    state.running = false;
    setRunning(false);
  }
}

function resetVault() {
  setStep(null, null);
  $("offer-wire").hidden = true;
  const tag = document.querySelector("#offer-wire .wire-tag");
  if (tag) tag.textContent = "402";
  $("provider-out").hidden = true;
  $("po-code").hidden = true;
  $("peek").setAttribute("aria-expanded", "false");
  $("peek").textContent = "view code";
  $("receipt-foot").hidden = true;
  $("settlement").hidden = true;
  $("settlement").className = "settlement";
  resetChecksToPending();
  const seal = $("seal");
  seal.classList.remove("stamp", "press");
  seal.dataset.state = "idle";
  $("seal-state").textContent = "READY";
  if (state.spec) $("seal-amount").textContent = usd(state.spec.priceCents);
}

function setRunning(on) {
  const btn = $("run");
  btn.disabled = on;
  btn.querySelector(".run-label").textContent = on ? "Running the pact…" : "Run the pact";
}

function setChip(kind, text) {
  const chip = $("escrow-chip");
  chip.className = "state-chip state-" + kind;
  chip.textContent = text;
}

function setSeal(stateName, cents, label) {
  const seal = $("seal");
  seal.dataset.state = stateName;
  if (cents != null) $("seal-amount").textContent = usd(cents);
  $("seal-state").textContent = String(label || "").toUpperCase();
  if (stateName === "held" && !REDUCED) {
    seal.classList.remove("press");
    void seal.offsetWidth;
    seal.classList.add("press");
  }
}

function stampSeal(released, cents) {
  const seal = $("seal");
  seal.dataset.state = released ? "released" : "refunded";
  $("seal-state").textContent = released ? "RELEASED" : "REFUNDED";
  $("seal-amount").textContent = released ? usd(cents) : usd(0);
  if (!REDUCED) {
    seal.classList.remove("stamp");
    void seal.offsetWidth;
    seal.classList.add("stamp");
  }
}

function showOffer(offer) {
  if (!offer) return;
  const tag = document.querySelector("#offer-wire .wire-tag");
  if (tag) tag.textContent = "402";
  $("offer-body").textContent =
    `Payment Required · ${offer.paymentId} · ${usd(offer.amountCents)} ${offer.asset} · ${offer.network}`;
  $("offer-wire").hidden = false;
}

function markOfferPaid(tx) {
  const payId = tx.payment ? tx.payment.paymentId : tx.offer ? tx.offer.paymentId : "";
  const payer = tx.payment ? tx.payment.authorization.from : "";
  const tag = document.querySelector("#offer-wire .wire-tag");
  if (tag) tag.textContent = "paid";
  $("offer-body").textContent =
    `X-PAYMENT accepted · ${payId} · ${usd(tx.amountCents)} from ${shortAddr(payer)} → escrow`;
  $("offer-wire").hidden = false;
}

function showProvider(p) {
  if (!p) return;
  $("po-id").textContent = p.provider;
  $("po-hash").textContent = "commit " + p.commitHash;
  $("po-headline").textContent = p.headline;
  $("po-code").textContent = p.code;
  $("provider-out").hidden = false;
}

function toggleCode() {
  const code = $("po-code");
  const open = code.hidden;
  code.hidden = !open;
  $("peek").setAttribute("aria-expanded", String(open));
  $("peek").textContent = open ? "hide code" : "view code";
}

function resetChecksToPending() {
  const rows = document.querySelectorAll("#checks .check");
  rows.forEach((li) => {
    li.className = "check pending";
    li.querySelector(".check-box").textContent = "▫";
    if (!REDUCED) {
      
      li.classList.remove("in");
    } else {
      li.classList.add("in");
    }
  });
}

function revealCheck(c) {
  return new Promise((resolve) => {
    const li = document.querySelector(`#checks .check[data-id="${c.id}"]`);
    if (!li) return resolve();
    li.className = "check " + c.status;
    li.querySelector(".check-box").textContent = c.status === "pass" ? "✓" : "✗";
    li.querySelector(".check-label").textContent = c.label;
    li.querySelector(".check-detail").textContent = c.detail;
    
    void li.offsetWidth;
    li.classList.add("in");
    resolve();
  });
}

function showSettlement(tx) {
  const el = $("settlement");
  const released = tx.escrow === "RELEASED";
  el.className = "settlement " + (released ? "released" : "refunded");
  const verdict = released
    ? `x402 released ${usd(tx.amountCents)} → provider`
    : `escrow refunded ${usd(tx.amountCents)} → buyer`;
  $("settle-verdict").textContent = verdict;
  $("settle-tx").textContent = tx.settlementTx || "";
  el.hidden = false;
}

function setStep(name, mode) {
  const steps = document.querySelectorAll("#stepper li");
  steps.forEach((li) => {
    const s = li.dataset.step;
    if (name === null) {
      li.removeAttribute("data-active");
      li.removeAttribute("data-done");
      return;
    }
    if (s === name) {
      if (mode === "active") {
        li.setAttribute("data-active", "true");
        li.removeAttribute("data-done");
      } else if (mode === "done") {
        li.removeAttribute("data-active");
        li.setAttribute("data-done", "true");
      }
    }
  });
}

function renderLedger(rows, freshId) {
  const wrap1 = $("ledger");
  const wrap2 = $("ledger-body");
  
  if (wrap1) {
    if (!rows || rows.length === 0) {
      wrap1.innerHTML = `<div class="ledger-empty" id="ledger-empty">No pacts settled yet — run one to write the first line.</div>`;
    } else {
      wrap1.innerHTML = "";
      rows.forEach((tx) => {
        const settled = tx.escrow === "RELEASED" || tx.escrow === "REFUNDED";
        const released = tx.escrow === "RELEASED";
        const v = tx.verification;
        const tests = v ? `${v.testsPassed}/${v.testsTotal}` : "—";
        const prov = tx.provider ? tx.provider.provider : "—";
        const stateLabel = settled ? tx.escrow.toLowerCase() : "pending";
        const stateCls = released ? "released" : settled ? "refunded" : "";
        const amount = released ? usd(tx.amountCents) : usd(0);

        const row = document.createElement("div");
        row.className = "lrow" + (tx.id === freshId ? " fresh" : "");
        row.innerHTML =
          `<span class="l-id">${esc(tx.id)}</span>` +
          `<span class="l-prov">${esc(prov)}</span>` +
          `<span class="l-tests">tests ${esc(tests)}</span>` +
          `<span class="l-state ${stateCls}">${esc(stateLabel)}</span>` +
          `<span class="l-amount ${stateCls}">${esc(amount)}</span>`;
        wrap1.appendChild(row);
      });
    }
  }

  if (wrap2) {
    wrap2.innerHTML = "";
    if (rows && rows.length > 0) {
      rows.forEach((tx) => {
        const settled = tx.escrow === "RELEASED" || tx.escrow === "REFUNDED";
        const released = tx.escrow === "RELEASED";
        const stateLabel = settled ? tx.escrow : "PENDING";
        const amount = released ? usd(tx.amountCents) : usd(0);
        
        const tr = document.createElement("tr");
        tr.style.borderBottom = "1px solid var(--border)";
        tr.innerHTML = 
          `<td style="padding: 1rem;">${esc(tx.id)}</td>` +
          `<td style="padding: 1rem;">${esc(stateLabel)}</td>` +
          `<td style="padding: 1rem; color: var(--gold);">${esc(amount)}</td>` +
          `<td style="padding: 1rem; color: var(--text-muted); font-family: monospace;">${esc(tx.settlementTx || tx.payment?.paymentId || "0x...")}</td>`;
        wrap2.appendChild(tr);
      });
    }
  }
}

function esc(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
  );
}

function shortAddr(a) {
  const s = String(a || "");
  return s.length > 12 ? `${s.slice(0, 6)}…${s.slice(-4)}` : s;
}

async function runTollbooth() {
  if (state.running) return;
  state.running = true;
  const btn = $("run-tollbooth");
  btn.disabled = true;
  const term = $("tb-terminal");
  
  try {
    term.textContent = "> POST /api/tollbooth\n";
    await beat(400);

    let offer;
    try {
      const res = await fetch("/api/tollbooth", { method: "POST" });
      const body = await res.json().catch(() => ({}));
      if (res.status === 402) {
        offer = body.offer || (body.accepts && body.accepts[0]);
        term.textContent += "< 402 Payment Required\n";
        term.textContent += `  Offer: ${usd(offer.amountCents)} ${offer.asset}\n\n`;
      } else {
        throw new Error("Expected 402");
      }
    } catch (e) {
      term.textContent += `Error: ${e.message}\n`;
      return;
    }
    await beat(600);

    term.textContent += "> POST /api/tollbooth/pay\n";
    term.textContent += "  Signing x402 payment authorization...\n";
    await beat(600);
    
    const res = await fetch("/api/tollbooth/pay", { method: "POST" });
    const body = await res.json().catch(() => ({}));
    if (res.ok) {
      term.textContent += "< 200 OK\n";
      term.textContent += `  Response: ${JSON.stringify(body.data, null, 2)}\n\n`;
      term.textContent += `  Settled instantly via x402.\n`;
      if (body.stats) {
        renderTally(body.stats);
      }
    } else {
      term.textContent += `Error: ${body.error || res.statusText}\n`;
    }
  } finally {
    state.running = false;
    btn.disabled = false;
  }
}

function setupTabs() {
  const tabs = document.querySelectorAll(".nav-tab");
  const views = {
    escrow: $("view-escrow"),
    tollbooth: $("view-tollbooth"),
    ledger: $("view-ledger")
  };

  function switchTab(id) {
    tabs.forEach(t => {
      if (t.dataset.target === id) {
        t.classList.add("active");
        t.style.color = "var(--gold)";
        t.style.borderBottom = "2px solid var(--gold)";
      } else {
        t.classList.remove("active");
        t.style.color = "var(--text-muted)";
        t.style.borderBottom = "2px solid transparent";
      }
    });

    for (const key in views) {
      if (views[key]) {
        if (key === id) {
          views[key].style.display = key === "escrow" || key === "tollbooth" ? "grid" : "block";
        } else {
          views[key].style.display = "none";
        }
      }
    }
  }

  tabs.forEach(t => {
    t.addEventListener("click", () => switchTab(t.dataset.target));
  });

  const btnTollbooth = $("run-tollbooth");
  if (btnTollbooth) {
    btnTollbooth.addEventListener("click", runTollbooth);
  }
}

function initVaultLight() {
  if (REDUCED) return;
  if (!window.matchMedia("(pointer: fine)").matches) return;

  const root = document.documentElement;
  let tx = 0, ty = 0;   // target offset from viewport centre
  let x = 0, y = 0;     // eased current offset
  let raf = null;

  function frame() {
    x += (tx - x) * 0.12;
    y += (ty - y) * 0.12;
    root.style.setProperty("--mx-off", x.toFixed(1) + "px");
    root.style.setProperty("--my-off", y.toFixed(1) + "px");
    if (Math.abs(tx - x) > 0.4 || Math.abs(ty - y) > 0.4) {
      raf = requestAnimationFrame(frame);
    } else {
      raf = null;
    }
  }

  window.addEventListener(
    "pointermove",
    (e) => {
      tx = e.clientX - window.innerWidth / 2;
      ty = e.clientY - window.innerHeight / 2;
      if (raf === null) raf = requestAnimationFrame(frame);
    },
    { passive: true }
  );
}

document.addEventListener("DOMContentLoaded", () => {
  boot();
  setupTabs();
  initVaultLight();
});

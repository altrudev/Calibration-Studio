"use strict";
(() => {
  const supported = new Set(["altru-intent-contract/0.1", "altru-intent-delta/0.1", "altru-intent-verification/0.1"]);
  const prefixes = Object.freeze({"altru-intent-contract/0.1":"INT","altru-intent-delta/0.1":"IDELTA","altru-intent-verification/0.1":"IVER"});
  const file = document.getElementById("artifact-file");
  if (!file) return;
  const esc = (value) => String(value ?? "—").replace(/[&<>"']/g, (ch) => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"})[ch]);
  const stable = (value) => Array.isArray(value) ? value.map(stable) : value && typeof value === "object" ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])])) : value;
  async function sha256(value) {
    const encoded = new TextEncoder().encode(JSON.stringify(stable(value)));
    const hash = await crypto.subtle.digest("SHA-256", encoded);
    return [...new Uint8Array(hash)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  }
  async function verify(value) {
    const prefix = prefixes[value.schema];
    const core = {...value}; delete core.id; delete core.fingerprint;
    const fingerprint = await sha256(core);
    if (value.fingerprint !== fingerprint) throw new Error("Intent artifact fingerprint mismatch");
    if (value.id !== `${prefix}-${fingerprint.slice(0, 12).toUpperCase()}`) throw new Error("Intent artifact identifier mismatch");
  }
  function show({metricLabel, metricValue, metricStatus, contextLabel, contextValue, countLabel, countValue, countMeta, title, html}) {
    document.getElementById("empty").hidden = true;
    document.getElementById("dashboard").hidden = false;
    document.getElementById("metric-label").textContent = metricLabel;
    document.getElementById("metric-value").textContent = metricValue;
    document.getElementById("metric-status").textContent = metricStatus;
    document.getElementById("context-label").textContent = contextLabel;
    document.getElementById("context-value").textContent = contextValue;
    const link = document.getElementById("context-link"); link.hidden = true; link.removeAttribute("href");
    document.getElementById("count-label").textContent = countLabel;
    document.getElementById("count-value").textContent = countValue;
    document.getElementById("count-meta").textContent = countMeta;
    document.getElementById("detail-title").textContent = title;
    document.getElementById("detail-content").innerHTML = html;
  }
  function renderContract(value) {
    const rows = value.clauses.map((clause) => `<article class="finding"><h3>${esc(clause.id)} — ${esc(clause.kind)}</h3><div class="meta">${esc(clause.severity)} · priority ${esc(clause.priority)} · confidence ${esc(clause.confidence)} · ${esc(clause.target)}</div><p><strong>${esc(clause.operator)}</strong>${Object.prototype.hasOwnProperty.call(clause,"value") ? ` ${esc(JSON.stringify(clause.value))}` : ""}</p><p>${esc(clause.provenance?.statement || "No provenance statement")}</p></article>`).join("");
    const conflicts = value.conflicts.length ? `<h3>Conflicts</h3>${value.conflicts.map((item) => `<article class="finding"><h3>${esc(item.a)} ↔ ${esc(item.b)}</h3><div class="meta">${esc(item.severity)} · ${esc(item.target)}</div><p>${esc(item.reason)}</p></article>`).join("")}` : "";
    show({metricLabel:"Intent",metricValue:value.summary.hard_conflict_count ? "CONFLICT" : "COMPILED",metricStatus:`${value.id} · integrity verified`,contextLabel:"Scope",contextValue:value.scope.id,countLabel:"Clauses",countValue:value.summary.clause_count,countMeta:`${value.summary.hard_count} hard · ${value.summary.soft_count} soft · v${value.version}`,title:value.label || value.intent_id,html:rows + conflicts});
  }
  function renderDelta(value) {
    const group = (title, items) => `<article class="finding"><h3>${esc(title)}</h3><p>${esc(items.join(", ") || "None")}</p></article>`;
    show({metricLabel:"Intent delta",metricValue:`v${value.from_version} → v${value.to_version}`,metricStatus:`${value.id} · integrity verified`,contextLabel:"Intent",contextValue:value.intent_id,countLabel:"Affected",countValue:value.affected.length,countMeta:`${value.added.length} added · ${value.removed.length} removed · ${value.changed.length} changed`,title:"Incremental semantic change",html:group("Added",value.added)+group("Removed",value.removed)+group("Changed",value.changed)+group("Affected region",value.affected)});
  }
  function renderVerification(value) {
    const rows = value.results.map((item) => `<article class="finding ${esc(item.status)}"><h3>${esc(item.id)} — ${esc(item.status.toUpperCase())}</h3><div class="meta">${esc(item.kind)} · ${esc(item.severity)} · ${esc(item.target)}</div><div class="pair"><div><strong>Expected</strong>${esc(JSON.stringify(item.expected))}</div><div><strong>Actual</strong>${esc(JSON.stringify(item.actual))}</div></div></article>`).join("");
    show({metricLabel:"Intent verification",metricValue:value.status.toUpperCase(),metricStatus:`${value.id} · integrity verified`,contextLabel:"Intent",contextValue:`${value.intent_id} v${value.intent_version}`,countLabel:"Score",countValue:value.score == null ? "—" : `${value.score}%`,countMeta:`${value.hard_failure_count} hard failures · ${value.unknown_count} unknown`,title:"Intent conformance",html:rows});
  }
  file.addEventListener("change", async (event) => {
    try {
      if (!file.files?.[0]) return;
      const value = JSON.parse(await file.files[0].text());
      if (!supported.has(value?.schema)) return;
      event.stopImmediatePropagation();
      await verify(value);
      if (value.schema === "altru-intent-contract/0.1") renderContract(value);
      else if (value.schema === "altru-intent-delta/0.1") renderDelta(value);
      else renderVerification(value);
    } catch (error) {
      event.stopImmediatePropagation();
      alert(`Could not open intent artifact: ${error.message}`);
    }
  }, true);
})();

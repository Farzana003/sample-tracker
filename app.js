(() => {
  const OPTIONS_KEY = "sampleTracker.options.v1";
  const ENTRIES_KEY = "sampleTracker.entries.v1";
  const $ = (id) => document.getElementById(id);

  // ---------- storage ----------
  function loadOptions() {
    try {
      const raw = JSON.parse(localStorage.getItem(OPTIONS_KEY));
      if (raw && typeof raw === "object") return raw;
    } catch { /* fall through to defaults */ }
    const copy = JSON.parse(JSON.stringify(DEFAULT_OPTIONS));
    saveOptions(copy);
    return copy;
  }
  function saveOptions(opts) {
    try { localStorage.setItem(OPTIONS_KEY, JSON.stringify(opts)); } catch { /* private mode */ }
  }
  function loadEntries() {
    try {
      const raw = JSON.parse(localStorage.getItem(ENTRIES_KEY));
      if (Array.isArray(raw)) return raw;
    } catch { /* fall through to seed */ }
    const seeded = SEED_ENTRIES.map((e, i) => ({ id: `seed-${i}`, ...e }));
    saveEntries(seeded);
    return seeded;
  }
  function saveEntries(list) {
    try { localStorage.setItem(ENTRIES_KEY, JSON.stringify(list)); } catch { /* private mode */ }
  }

  let options = loadOptions();
  let entries = loadEntries();
  let editingId = null;

  const fieldByKey = Object.fromEntries(FIELDS.map((f) => [f.key, f]));

  // ---------- helpers ----------
  const escapeHtml = (s) =>
    String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  function formatDate(iso) {
    if (!iso) return "";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
    const [y, m, d] = iso.split("-").map(Number);
    return new Date(y, m - 1, d).toLocaleDateString([], { day: "2-digit", month: "short", year: "numeric" });
  }

  function optionListHtml(key, selected) {
    const list = options[key] || [];
    return (
      `<option value="">— Select —</option>` +
      list.map((v) => `<option value="${escapeHtml(v)}" ${v === selected ? "selected" : ""}>${escapeHtml(v)}</option>`).join("")
    );
  }
  function datalistHtml(key) {
    const list = options[key] || [];
    return list.map((v) => `<option value="${escapeHtml(v)}"></option>`).join("");
  }

  // ---------- form rendering ----------
  function fieldControlHtml(f, value = "") {
    const id = `f_${f.key}`;
    if (f.type === "select") {
      return `<select id="${id}" name="${f.key}">${optionListHtml(f.key, value)}</select>`;
    }
    if (f.type === "combo") {
      return (
        `<input id="${id}" name="${f.key}" list="dl_${f.key}" value="${escapeHtml(value)}" autocomplete="off" placeholder="Type or pick existing">` +
        `<datalist id="dl_${f.key}">${datalistHtml(f.key)}</datalist>`
      );
    }
    if (f.type === "date") {
      return `<input id="${id}" name="${f.key}" type="date" value="${escapeHtml(value)}">`;
    }
    return `<input id="${id}" name="${f.key}" value="${escapeHtml(value)}">`;
  }

  function renderFormFields(preserve = {}) {
    const merchHtml = FIELDS.filter((f) => f.section === "merch")
      .map((f) => `<div class="field"><label for="f_${f.key}">${escapeHtml(f.label)}</label>${fieldControlHtml(f, preserve[f.key] || "")}</div>`)
      .join("");
    const techHtml = FIELDS.filter((f) => f.section === "tech")
      .map((f) => `<div class="field"><label for="f_${f.key}">${escapeHtml(f.label)}</label>${fieldControlHtml(f, preserve[f.key] || "")}</div>`)
      .join("");
    $("merchFields").innerHTML = merchHtml;
    $("techFields").innerHTML = techHtml;
  }

  function readFormValues() {
    const values = {};
    FIELDS.forEach((f) => {
      const el = document.getElementById(`f_${f.key}`);
      values[f.key] = el ? el.value.trim() : "";
    });
    return values;
  }

  // ---------- table rendering ----------
  function renderTableHead() {
    const cells = FIELDS.map(
      (f) => `<th class="grp-${f.section}">${escapeHtml(f.label)}</th>`
    ).join("");
    $("tableHead").innerHTML = `<tr>${cells}<th>Actions</th></tr>`;
  }

  function renderTable() {
    const q = $("searchBox").value.trim().toLowerCase();
    const rows = entries.filter((e) => {
      if (!q) return true;
      return FIELDS.some((f) => String(e[f.key] || "").toLowerCase().includes(q));
    });

    $("countBadge").textContent = entries.length;
    $("tableEmpty").hidden = rows.length > 0;
    $("entriesTable").hidden = rows.length === 0 && entries.length === 0;

    $("tableBody").innerHTML = rows
      .map((e) => {
        const cells = FIELDS.map((f) => {
          const raw = e[f.key] || "";
          const shown = f.type === "date" ? formatDate(raw) : raw;
          return `<td title="${escapeHtml(raw)}">${escapeHtml(shown)}</td>`;
        }).join("");
        return `<tr data-id="${e.id}">${cells}<td class="actions-cell">
          <button type="button" class="btn small" data-action="edit">Edit</button>
          <button type="button" class="btn small danger" data-action="delete">Delete</button>
        </td></tr>`;
      })
      .join("");
  }

  $("tableBody").addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-action]");
    if (!btn) return;
    const tr = btn.closest("tr");
    const id = tr.dataset.id;
    if (btn.dataset.action === "delete") {
      if (!confirm("Delete this entry?")) return;
      entries = entries.filter((en) => en.id !== id);
      saveEntries(entries);
      renderTable();
      if (editingId === id) cancelEdit();
    } else if (btn.dataset.action === "edit") {
      const entry = entries.find((en) => en.id === id);
      if (!entry) return;
      editingId = id;
      renderFormFields(entry);
      $("entryForm").querySelector(".btn.primary").textContent = "Save changes";
      $("entryForm").scrollIntoView({ behavior: "smooth", block: "start" });
    }
  });

  function cancelEdit() {
    editingId = null;
    renderFormFields();
    $("entryForm").querySelector(".btn.primary").textContent = "Add entry";
  }

  // ---------- form submit ----------
  $("entryForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const values = readFormValues();
    const hasAny = Object.values(values).some((v) => v);
    if (!hasAny) return;

    if (editingId) {
      entries = entries.map((en) => (en.id === editingId ? { ...en, ...values } : en));
    } else {
      const id = crypto.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random());
      entries.push({ id, ...values });
    }
    saveEntries(entries);
    cancelEdit();
    renderTable();
  });

  $("resetBtn").addEventListener("click", () => cancelEdit());
  $("searchBox").addEventListener("input", renderTable);

  // ---------- data validation lists dialog ----------
  const listsDialog = $("listsDialog");

  function renderListsDialog() {
    const listable = FIELDS.filter((f) => f.type === "select" || f.type === "combo");
    $("listsContainer").innerHTML = listable
      .map((f) => {
        const vals = options[f.key] || [];
        const chips = vals
          .map(
            (v) =>
              `<span class="chip">${escapeHtml(v)}<button type="button" data-field="${f.key}" data-value="${escapeHtml(v)}" aria-label="Remove ${escapeHtml(v)}">&times;</button></span>`
          )
          .join("");
        return `<div class="list-block">
          <h3>${escapeHtml(f.label)} <span class="count">(${vals.length} value${vals.length === 1 ? "" : "s"})</span></h3>
          <div class="chip-row">${chips || '<span class="count">No values yet</span>'}</div>
          <div class="add-row">
            <input type="text" placeholder="Add a new value…" data-add-field="${f.key}">
            <button type="button" class="btn small" data-add-btn="${f.key}">Add</button>
          </div>
        </div>`;
      })
      .join("");
  }

  function addOptionValue(key, value) {
    const v = value.trim();
    if (!v) return;
    const list = options[key] || (options[key] = []);
    if (list.some((existing) => existing.toLowerCase() === v.toLowerCase())) return;
    list.push(v);
    list.sort((a, b) => a.localeCompare(b));
    saveOptions(options);
    const preserved = readFormValues();
    renderFormFields(preserved);
    renderListsDialog();
  }
  function removeOptionValue(key, value) {
    const list = options[key] || [];
    options[key] = list.filter((v) => v !== value);
    saveOptions(options);
    const preserved = readFormValues();
    renderFormFields(preserved);
    renderListsDialog();
  }

  $("listsContainer").addEventListener("click", (e) => {
    const removeBtn = e.target.closest("button[data-field]");
    if (removeBtn) {
      removeOptionValue(removeBtn.dataset.field, removeBtn.dataset.value);
      return;
    }
    const addBtn = e.target.closest("button[data-add-btn]");
    if (addBtn) {
      const key = addBtn.dataset.addBtn;
      const input = $("listsContainer").querySelector(`input[data-add-field="${key}"]`);
      addOptionValue(key, input.value);
      input.value = "";
      input.focus();
    }
  });
  $("listsContainer").addEventListener("keydown", (e) => {
    if (e.key === "Enter" && e.target.matches("input[data-add-field]")) {
      e.preventDefault();
      const key = e.target.dataset.addField;
      addOptionValue(key, e.target.value);
      e.target.value = "";
    }
  });

  $("viewListsBtn").addEventListener("click", () => {
    renderListsDialog();
    listsDialog.showModal();
  });
  $("closeListsBtn").addEventListener("click", () => listsDialog.close());
  listsDialog.addEventListener("click", (e) => {
    if (e.target === listsDialog) listsDialog.close();
  });

  // ---------- CSV export ----------
  function csvEscape(v) {
    const s = String(v ?? "");
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }
  $("exportBtn").addEventListener("click", () => {
    const merchFields = FIELDS.filter((f) => f.section === "merch");
    const techFields = FIELDS.filter((f) => f.section === "tech");
    const line1 =
      ["FILLED BY MERCHANDISING DEPARTMENT", ...Array(merchFields.length - 1).fill("")].join(",") +
      "," +
      ["FILLED BY TECHNICAL DEPARTMENT", ...Array(techFields.length - 1).fill("")].join(",");
    const header = [...merchFields.map((f) => f.label), ...techFields.map((f) => f.label)].map(csvEscape).join(",");
    const rows = entries.map((e) =>
      [...merchFields, ...techFields].map((f) => csvEscape(f.type === "date" ? formatDate(e[f.key]) : e[f.key] || "")).join(",")
    );
    const csv = [line1, header, ...rows].join("\r\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `sample-tracker-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  });

  // ---------- deep link from the cover page (?section=merch|tech|all) ----------
  function handleDeepLink() {
    const section = new URLSearchParams(location.search).get("section");
    const targets = { merch: "merchSection", tech: "techSection", all: "tableSection" };
    const id = targets[section];
    if (!id) return;
    const el = document.getElementById(id);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "start" });
    el.classList.add("deep-link-highlight");
    setTimeout(() => el.classList.remove("deep-link-highlight"), 2200);
  }

  // ---------- init ----------
  renderFormFields();
  renderTableHead();
  renderTable();
  handleDeepLink();
})();

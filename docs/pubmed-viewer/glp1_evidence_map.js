const DATA_PATH = "./viewer_data_glp1_evidence_map.json";

const state = {
  data: null,
  activeStatementId: null,
};

function escapeHtml(text) {
  return String(text ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function pubmedUrl(pmid) {
  return `https://pubmed.ncbi.nlm.nih.gov/${encodeURIComponent(String(pmid))}/`;
}

function getStatement(id) {
  return (state.data?.statements || []).find((statement) => statement.id === id) || null;
}

function getSegmentIdsForStatement(statement) {
  return new Set(statement?.highlight_segment_ids || []);
}

function statementLabelForSegment(segment) {
  const labels = (segment.statement_ids || [])
    .map((id) => getStatement(id)?.label || "")
    .filter(Boolean);
  return labels.join(", ");
}

function renderPageTabs() {
  const links = [
    ["articleViewTabLink", "./index.html"],
    ["globalRankingLink", "./statement_ranking.html"],
    ["articleRankingLink", "./article_ranking.html"],
    ["evidenceMapLink", "./glp1_evidence_map.html"],
  ];
  for (const [id, href] of links) {
    const link = document.getElementById(id);
    if (link) {
      link.href = href;
    }
  }
}

function renderHeader() {
  document.title = `GLP-1 Evidence Map - ${state.data.title}`;
  document.getElementById("glp1MapTitle").textContent = state.data.title;
  document.getElementById("glp1MapSubtitle").textContent = state.data.subtitle || "Evidence map";
  document.getElementById("glp1TextTitle").textContent = state.data.text_label || "Evidence synthesis text";
}

function renderEvidenceText() {
  const container = document.getElementById("glp1EvidenceText");
  const active = getStatement(state.activeStatementId);
  const activeSegments = getSegmentIdsForStatement(active);

  container.innerHTML = (state.data.text_segments || [])
    .map((segment) => {
      const linkedStatementIds = segment.statement_ids || [];
      const isLinked = linkedStatementIds.length > 0;
      const isActive = activeSegments.has(segment.id);
      const isDimmed = active && isLinked && !isActive;
      const classNames = [
        "glp1-text-segment",
        isLinked ? "glp1-text-segment--linked" : "",
        isActive ? "is-active" : "",
        isDimmed ? "is-dimmed" : "",
      ]
        .filter(Boolean)
        .join(" ");
      const label = statementLabelForSegment(segment);
      const pmids = (segment.pmids || [])
        .map((pmid) => `<a href="${pubmedUrl(pmid)}" target="_blank" rel="noopener">PMID:${escapeHtml(pmid)}</a>`)
        .join(" ");
      const interactiveAttrs = isLinked
        ? 'tabindex="0" role="button"'
        : "";

      return `
        <span class="${classNames}" data-segment-id="${escapeHtml(segment.id)}" data-statement-ids="${escapeHtml(linkedStatementIds.join(","))}" ${interactiveAttrs}>
          <span class="glp1-text-segment__body">${escapeHtml(segment.text)}</span>
          ${label ? `<span class="glp1-text-segment__labels">${escapeHtml(label)}</span>` : ""}
          ${pmids ? `<span class="glp1-text-segment__pmids">${pmids}</span>` : ""}
        </span>
      `;
    })
    .join(" ");

  for (const segmentEl of container.querySelectorAll(".glp1-text-segment--linked")) {
    const selectFirstStatement = () => {
      const ids = String(segmentEl.dataset.statementIds || "").split(",").filter(Boolean);
      if (!ids.length) {
        return;
      }
      if (ids.includes(state.activeStatementId)) {
        return;
      }
      setActiveStatement(ids[0], { scrollSidebar: true });
    };
    segmentEl.addEventListener("click", (event) => {
      if (event.target.closest("a")) {
        return;
      }
      selectFirstStatement();
    });
    segmentEl.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        selectFirstStatement();
      }
    });
  }
}

function renderRelatedStudies(statement) {
  const studies = statement.related_studies || [];
  if (!studies.length) {
    return `<p class="glp1-related-empty">No cited related studies listed for this statement.</p>`;
  }

  return `
    <ul class="glp1-related-list">
      ${studies
        .map((study) => `
          <li>
            <a href="${pubmedUrl(study.pmid)}" target="_blank" rel="noopener">PMID:${escapeHtml(study.pmid)}</a>
            <span>${escapeHtml(study.note || "")}</span>
          </li>
        `)
        .join("")}
    </ul>
  `;
}

function renderSidebar() {
  const summary = document.getElementById("glp1SidebarSummary");
  const list = document.getElementById("glp1StatementList");
  const statements = state.data.statements || [];
  summary.textContent = `${statements.length} GLP-1 statements mapped to highlighted evidence text.`;

  list.innerHTML = statements
    .map((statement) => {
      const active = statement.id === state.activeStatementId;
      return `
        <article class="glp1-statement-card ${active ? "is-active" : ""}" id="card-${escapeHtml(statement.id)}">
          <button class="glp1-statement-card__button" type="button" data-statement-id="${escapeHtml(statement.id)}">
            <span class="glp1-statement-card__meta">
              <span>${escapeHtml(statement.label)}</span>
              <span class="glp1-map-pill">Text mapped</span>
            </span>
            <span class="glp1-statement-card__topic">${escapeHtml(statement.topic)}</span>
            <span class="glp1-statement-card__text">${escapeHtml(statement.statement)}</span>
          </button>
          <div class="glp1-statement-card__related">
            <h3>Related studies</h3>
            ${renderRelatedStudies(statement)}
          </div>
        </article>
      `;
    })
    .join("");

  for (const button of list.querySelectorAll(".glp1-statement-card__button")) {
    button.addEventListener("click", () => {
      setActiveStatement(button.dataset.statementId, { scrollText: true });
    });
  }
}

function setActiveStatement(statementId, options = {}) {
  state.activeStatementId = statementId;
  renderEvidenceText();
  renderSidebar();

  if (options.scrollText) {
    const statement = getStatement(statementId);
    const firstSegmentId = statement?.highlight_segment_ids?.[0];
    const segmentEl = firstSegmentId
      ? [...document.querySelectorAll("[data-segment-id]")].find((element) => element.dataset.segmentId === firstSegmentId)
      : null;
    segmentEl?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  if (options.scrollSidebar) {
    document.getElementById(`card-${statementId}`)?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }
}

async function init() {
  renderPageTabs();
  const response = await fetch(DATA_PATH, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Failed to load ${DATA_PATH}: ${response.status}`);
  }
  state.data = await response.json();
  state.activeStatementId = state.data.statements?.[0]?.id || null;
  renderHeader();
  renderEvidenceText();
  renderSidebar();
}

init().catch((error) => {
  document.getElementById("glp1-map-main").innerHTML = `<div class="viewer-empty-state">${escapeHtml(error.message)}</div>`;
});

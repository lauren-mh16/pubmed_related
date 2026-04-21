const DATASET_OPTIONS = [
  { file: "./viewer_data.json", label: "Retracted articles", summaryFile: "./retracted_summaries.jsonl" },
  { file: "./viewer_data_amd.json", label: "AMD cases", summaryFile: "./amd_summaries.jsonl" },
  { file: "./viewer_data_oph1.json", label: "Ophthalmology cases", summaryFile: "./oph1_summaries.jsonl" },
  { file: "./viewer_data_retracted_rand_matches.json", label: "retracted_rand_matches", summaryFile: "./retracted_rand_matches_summaries.jsonl" },
  { file: "./viewer_data_retracted_rand.json", label: "retracted_rand", summaryFile: "./retracted_rand_summaries.jsonl" },
  { file: "./viewer_data_retracted_rand_litsense.json", label: "retracted_rand_litsense", summaryFile: "./retracted_rand_litsense_summaries.jsonl" },
  { file: "./viewer_data_cochrane.json", label: "cochrane", summaryFile: "./cochrane_summaries.jsonl" },
  { file: "./viewer_data_cochrane_litsense.json", label: "cochrane_litsense", summaryFile: "./cochrane_litsense_summaries.jsonl" },
];
const VIEWER_CACHE_VERSION = "20260421c";

const state = {
  data: null,
  dataPath: "./viewer_data.json",
  authorsByPmid: {},
  statementSummariesByKey: {},
  sourceIndex: 0,
  statementIndex: -1,
  filter: "all",
  evidenceSort: "default",
  evidenceOverlayOpen: false,
};

function getQueryParam(name) {
  return new URLSearchParams(window.location.search).get(name);
}

function setQueryParam(name, value) {
  const url = new URL(window.location.href);
  if (value) {
    url.searchParams.set(name, value);
  } else {
    url.searchParams.delete(name);
  }
  window.history.replaceState({}, "", url);
}

function comparePmidsAscending(a, b) {
  const aNum = Number.parseInt(String(a ?? ""), 10);
  const bNum = Number.parseInt(String(b ?? ""), 10);
  if (Number.isFinite(aNum) && Number.isFinite(bNum) && aNum !== bNum) {
    return aNum - bNum;
  }
  return String(a ?? "").localeCompare(String(b ?? ""));
}

function normalizeDataPath(dataPath) {
  if (!dataPath) {
    return "./viewer_data.json";
  }
  return dataPath.startsWith("./") ? dataPath : `./${dataPath}`;
}

function normalizeNonNegativeInt(value, fallback = 0) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.max(0, Math.floor(parsed));
}

function parseOptionalNonNegativeInt(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return null;
  }
  return Math.floor(parsed);
}

function escapeHtml(text) {
  return String(text ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function getCurrentSource() {
  return state.data?.sources?.[state.sourceIndex] || null;
}

function getCurrentStatement() {
  const source = getCurrentSource();
  if (!source?.statements?.length || state.statementIndex < 0) {
    return null;
  }
  return source.statements[state.statementIndex] || null;
}

function getSummaryKey(sourcePmid, statementIdx) {
  return `${sourcePmid}::${statementIdx}`;
}

function normalizeSummaryHighlights(value) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((item) => {
      if (!item || typeof item !== "object") {
        return null;
      }
      const pmid = String(item.pmid || "").trim();
      const snippet = String(item.snippet || "").trim();
      if (!pmid || !snippet) {
        return null;
      }
      return { pmid, snippet };
    })
    .filter(Boolean);
}

function getSummaryPathForDataPath(dataPath) {
  return DATASET_OPTIONS.find((dataset) => dataset.file === dataPath)?.summaryFile || null;
}

async function loadStatementSummaries(summaryPath) {
  if (!summaryPath) {
    return {};
  }

  const response = await fetch(summaryPath, { cache: "no-store" }).catch(() => null);
  if (!response || !response.ok) {
    return {};
  }

  const text = await response.text();
  const summariesByKey = {};

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) {
      continue;
    }

    let obj;
    try {
      obj = JSON.parse(line);
    } catch (error) {
      console.warn("Skipping invalid summary JSONL row:", error);
      continue;
    }

    const sourcePmid = String(obj.source_pmid || "").trim();
    const statementIdx = Number(obj.statement_idx);
    if (!sourcePmid || !Number.isFinite(statementIdx)) {
      continue;
    }

    summariesByKey[getSummaryKey(sourcePmid, statementIdx)] = {
      support_summary: String(obj.support_summary || "").trim(),
      contradict_summary: String(obj.contradict_summary || "").trim(),
      support_score: obj.support_score,
      contradict_score: obj.contradict_score,
      conclusion: String(obj.conclusion || obj.notes || "").trim(),
      support_highlights: normalizeSummaryHighlights(obj.support_highlights),
      contradict_highlights: normalizeSummaryHighlights(obj.contradict_highlights),
    };
  }

  return summariesByKey;
}

async function loadJsonWithSessionCache(path) {
  const cacheKey = `${VIEWER_CACHE_VERSION}:${path}`;
  try {
    const cached = sessionStorage.getItem(cacheKey);
    if (cached) {
      return JSON.parse(cached);
    }
  } catch (error) {
    console.warn("Unable to read viewer session cache:", error);
  }

  const response = await fetch(path, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Failed to load ${path}: ${response.status}`);
  }

  const data = await response.json();
  try {
    sessionStorage.setItem(cacheKey, JSON.stringify(data));
  } catch (error) {
    console.warn("Unable to write viewer session cache:", error);
  }
  return data;
}

function attachStatementSummaries() {
  for (const source of state.data?.sources || []) {
    for (const statement of source.statements || []) {
      const summary =
        state.statementSummariesByKey[getSummaryKey(source.pmid, statement.idx)] || null;
      statement.summary = summary;
    }
  }
}

function buildViewerPageUrl(pagePath, extraParams = {}) {
  const url = new URL(pagePath, window.location.href);
  url.searchParams.set("data", state.dataPath.replace("./", ""));
  if (state.minTotalArticles > 0) {
    url.searchParams.set("min_total", String(state.minTotalArticles));
  }

  for (const [key, value] of Object.entries(extraParams)) {
    if (value === null || value === undefined || value === "") {
      url.searchParams.delete(key);
    } else {
      url.searchParams.set(key, String(value));
    }
  }

  return url.toString();
}

function renderPageTabs() {
  const articleViewTabLink = document.getElementById("articleViewTabLink");
  const globalRankingLink = document.getElementById("globalRankingLink");
  const articleRankingLink = document.getElementById("articleRankingLink");
  const currentSource = getCurrentSource();

  if (articleViewTabLink) {
    articleViewTabLink.href = buildViewerPageUrl("./index.html", {
      pmid: currentSource?.pmid || "",
    });
  }

  if (globalRankingLink) {
    globalRankingLink.href = buildViewerPageUrl("./statement_ranking.html");
  }

  if (articleRankingLink) {
    articleRankingLink.href = buildViewerPageUrl("./article_ranking.html");
  }
}

function getScoreBreakdown(statement) {
  const breakdown = {
    supportStrong: 0,
    supportPartial: 0,
    contradictPartial: 0,
    contradictStrong: 0,
  };

  for (const item of statement.evidence || []) {
    if (item.score === 2) {
      breakdown.supportStrong += 1;
    } else if (item.score === 1) {
      breakdown.supportPartial += 1;
    } else if (item.score === -1) {
      breakdown.contradictPartial += 1;
    } else if (item.score === -2) {
      breakdown.contradictStrong += 1;
    }
  }

  return breakdown;
}

function getEvidencePmidSortValue(item) {
  const parsed = Number.parseInt(String(item.related_pmid || ""), 10);
  return Number.isFinite(parsed) ? parsed : -1;
}

function sortEvidenceItems(items) {
  if (state.evidenceSort !== "recent") {
    return items;
  }
  return [...items].sort((a, b) => {
    const pmidDiff = getEvidencePmidSortValue(b) - getEvidencePmidSortValue(a);
    if (pmidDiff !== 0) {
      return pmidDiff;
    }
    return String(a.title || "").localeCompare(String(b.title || ""));
  });
}

function shouldMergeAllEvidence() {
  return state.filter === "all" && state.evidenceSort === "recent";
}

function createLegendItem(label, className, count) {
  const span = document.createElement("span");
  span.className = `viewer-legend-item ${className}`;
  span.textContent = `${label}: ${count}`;
  return span;
}

function createStatementSummaryDetails(statement) {
  const container = document.createElement("div");
  container.className = "viewer-statement-summary";

  const summary = statement.summary;
  const supportSummary = summary?.support_summary || "";
  const contradictSummary = summary?.contradict_summary || "";
  const supportScore = summary?.support_score;
  const contradictScore = summary?.contradict_score;
  const conclusion = summary?.conclusion || "";
  const numericSupportScore = Number(supportScore);
  const numericContradictScore = Number(contradictScore);
  const hasNumericScores =
    Number.isFinite(numericSupportScore) && Number.isFinite(numericContradictScore);
  const controversyScore = hasNumericScores
    ? ((numericSupportScore + numericContradictScore) *
        Math.min(numericSupportScore, numericContradictScore)) / 50
    : null;
  const directionalScore = hasNumericScores && (numericSupportScore + numericContradictScore) !== 0
    ? (numericSupportScore - numericContradictScore) /
      (numericSupportScore + numericContradictScore)
    : null;

  const hasContent = Boolean(supportSummary || contradictSummary || conclusion);

  container.innerHTML = `
    <div class="viewer-statement-summary__content">
      ${
        hasContent
          ? `
            <div class="viewer-statement-summary__section">
              <h4>Support summary${supportScore !== undefined && supportScore !== null ? ` • score ${escapeHtml(String(supportScore))}` : ""}</h4>
              <p>${escapeHtml(supportSummary || "No support summary available.")}</p>
            </div>
            <div class="viewer-statement-summary__section">
              <h4>Contradict summary${contradictScore !== undefined && contradictScore !== null ? ` • score ${escapeHtml(String(contradictScore))}` : ""}</h4>
              <p>${escapeHtml(contradictSummary || "No contradict summary available.")}</p>
            </div>
            <div class="viewer-statement-summary__section">
              <h4>Conclusion</h4>
              <p>${escapeHtml(conclusion || "No conclusion available.")}</p>
            </div>
            ${
              hasNumericScores
                ? `
                  <div class="viewer-statement-summary__section">
                    <h4>Derived scores</h4>
                    <p>Controversy score: ${escapeHtml(controversyScore === null ? "NA" : controversyScore.toFixed(3))}</p>
                    <p>Directional score: ${escapeHtml(directionalScore === null ? "NA" : directionalScore.toFixed(3))}</p>
                  </div>
                `
                : ""
            }
          `
          : '<p class="viewer-statement-summary__empty">No statement summary is available for this item yet.</p>'
      }
    </div>
  `;

  return container;
}

function buildHighlightLookup(statement) {
  const lookup = {
    support: new Map(),
    contradict: new Map(),
  };
  for (const item of statement?.summary?.support_highlights || []) {
    if (!lookup.support.has(item.pmid)) {
      lookup.support.set(item.pmid, []);
    }
    lookup.support.get(item.pmid).push(item.snippet);
  }
  for (const item of statement?.summary?.contradict_highlights || []) {
    if (!lookup.contradict.has(item.pmid)) {
      lookup.contradict.set(item.pmid, []);
    }
    lookup.contradict.get(item.pmid).push(item.snippet);
  }
  return lookup;
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeHighlightText(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function splitAbstractIntoSentences(text) {
  const baseText = String(text || "");
  if (!baseText.trim()) {
    return [];
  }
  return baseText.match(/[^.!?\n]+(?:[.!?]+|$)|\n+/g) || [baseText];
}

function getSentenceHighlightIndexes(abstract, snippets) {
  const sentences = splitAbstractIntoSentences(abstract);
  const normalizedSentences = sentences.map((sentence) => normalizeHighlightText(sentence));
  const indexes = new Set();
  const uniqueSnippets = [...new Set((snippets || []).filter(Boolean))];

  for (const snippet of uniqueSnippets) {
    const normalizedSnippet = normalizeHighlightText(snippet);
    if (!normalizedSnippet) {
      continue;
    }

    let bestIndex = -1;
    let bestScore = 0;
    const snippetTokens = new Set(normalizedSnippet.split(" ").filter(Boolean));

    normalizedSentences.forEach((normalizedSentence, index) => {
      if (!normalizedSentence) {
        return;
      }
      if (normalizedSentence.includes(normalizedSnippet) || normalizedSnippet.includes(normalizedSentence)) {
        indexes.add(index);
        if (bestIndex === -1) {
          bestIndex = index;
          bestScore = Number.POSITIVE_INFINITY;
        }
        return;
      }

      let overlap = 0;
      for (const token of snippetTokens) {
        if (token.length >= 4 && normalizedSentence.includes(token)) {
          overlap += 1;
        }
      }
      const score = overlap / Math.max(snippetTokens.size, 1);
      if (score > bestScore) {
        bestScore = score;
        bestIndex = index;
      }
    });

    if (bestIndex >= 0 && bestScore >= 0.5) {
      indexes.add(bestIndex);
    }
  }

  return { sentences, indexes };
}

function highlightAbstractText(abstract, snippets) {
  const baseText = abstract || "No abstract text was available in the scored row.";
  const { sentences, indexes } = getSentenceHighlightIndexes(baseText, snippets);
  if (!sentences.length || !indexes.size) {
    return escapeHtml(baseText);
  }
  return sentences
    .map((sentence, index) =>
      indexes.has(index)
        ? `<mark class="viewer-evidence-highlight">${escapeHtml(sentence)}</mark>`
        : escapeHtml(sentence)
    )
    .join("");
}

function renderDatasetPicker() {
  const select = document.getElementById("datasetSelect");
  select.innerHTML = "";

  for (const dataset of DATASET_OPTIONS) {
    const option = document.createElement("option");
    option.value = dataset.file;
    option.textContent = dataset.label;
    option.selected = dataset.file === state.dataPath;
    select.appendChild(option);
  }

  if (!DATASET_OPTIONS.some((dataset) => dataset.file === state.dataPath)) {
    const option = document.createElement("option");
    option.value = state.dataPath;
    option.textContent = state.dataPath.replace("./", "");
    option.selected = true;
    select.appendChild(option);
  }

  select.addEventListener("change", (event) => {
    const nextPath = event.target.value;
    state.dataPath = nextPath;
    window.location.href = buildViewerPageUrl("./index.html");
  });
}

function renderSourcePicker() {
  const select = document.getElementById("sourceSelect");
  select.innerHTML = "";

  for (const [index, source] of state.data.sources.entries()) {
    const option = document.createElement("option");
    option.value = String(index);
    option.textContent = `${source.pmid} - ${source.title}`;
    option.selected = index === state.sourceIndex;
    select.appendChild(option);
  }

  select.addEventListener("change", (event) => {
    state.sourceIndex = Number(event.target.value);
    state.statementIndex = -1;
    state.filter = "all";
    setQueryParam("pmid", getCurrentSource()?.pmid || "");
    renderPageTabs();
    render();
  });
}

function renderHeader() {
  const source = getCurrentSource();

  if (!source) {
    return;
  }

  document.title = `${source.title} - PubMed`;
  document.getElementById("id_term").value = source.pmid;

  document.getElementById("article-page").dataset.articlePmid = source.pmid;
  document.getElementById("headingTitle").textContent = source.title;
  document.getElementById("identifierPmid").textContent = source.pmid;

  const pubmedLink = document.getElementById("identifierPubmed");
  const pubmedUrl = source.pubmed_url || `https://pubmed.ncbi.nlm.nih.gov/${encodeURIComponent(source.pmid)}/`;
  pubmedLink.href = pubmedUrl;

  const authors = state.authorsByPmid[source.pmid] || [];
  const authorsBlock = document.getElementById("authorsBlock");
  const authorsList = document.getElementById("authorsList");
  authorsList.innerHTML = "";
  if (authors.length) {
    authorsBlock.hidden = false;
    authors.forEach((author, index) => {
      const item = document.createElement("span");
      item.className = "authors-list-item";
      item.innerHTML = `<span class="full-name">${escapeHtml(author)}</span>${index < authors.length - 1 ? '<span class="comma">,&nbsp;</span>' : ""}`;
      authorsList.appendChild(item);
    });
  } else {
    authorsBlock.hidden = true;
  }
}

function renderAbstract() {
  const source = getCurrentSource();
  const container = document.getElementById("abstractContent");

  if (!source) {
    container.innerHTML = '<p>No abstract available.</p>';
    return;
  }

  if (!source.abstract) {
    container.innerHTML = "<p>No abstract available in the local input file.</p>";
    return;
  }

  container.innerHTML = `<p>${escapeHtml(source.abstract)}</p>`;
}

function getStatementListItems(source) {
  return (source?.statements || []).map((statement, originalIndex) => {
    const total = statement.counts?.total || 0;
    const contradictCount = statement.counts?.contradict || 0;
    const contradictRate = total > 0 ? contradictCount / total : 0;
    return {
      statement,
      originalIndex,
      total,
      contradictCount,
      contradictRate,
    };
  });
}

function renderStatements() {
  const source = getCurrentSource();
  const container = document.getElementById("statementList");
  const template = document.getElementById("statementTemplate");
  container.innerHTML = "";

  if (!source?.statements?.length) {
    container.innerHTML = '<div class="viewer-empty-state">No extracted statements found for this source article.</div>';
    return;
  }

  const statementItems = getStatementListItems(source);
  statementItems.forEach(({ statement, originalIndex, contradictRate }) => {
    const fragment = template.content.cloneNode(true);
    const card = fragment.querySelector(".viewer-statement-card");
    const breakdown = getScoreBreakdown(statement);
    const visibleTotal =
      breakdown.supportStrong +
      breakdown.supportPartial +
      breakdown.contradictPartial +
      breakdown.contradictStrong;
    const total = visibleTotal || 1;
    const visibleLabel = `${visibleTotal} support/contradict article${visibleTotal === 1 ? "" : "s"}`;

    card.classList.toggle("is-active", originalIndex === state.statementIndex);
    fragment.querySelector(".viewer-statement-card__index").textContent = `Statement ${statement.idx + 1}`;
    fragment.querySelector(".viewer-statement-card__totals").textContent =
      `${visibleLabel} • ${Math.round(contradictRate * 100)}% contradict`;
    fragment.querySelector(".viewer-statement-card__text").textContent = statement.text;

    fragment.querySelector(".viewer-distribution__segment--support-strong").style.width =
      `${(breakdown.supportStrong / total) * 100}%`;
    fragment.querySelector(".viewer-distribution__segment--support-partial").style.width =
      `${(breakdown.supportPartial / total) * 100}%`;
    fragment.querySelector(".viewer-distribution__segment--contradict-partial").style.width =
      `${(breakdown.contradictPartial / total) * 100}%`;
    fragment.querySelector(".viewer-distribution__segment--contradict-strong").style.width =
      `${(breakdown.contradictStrong / total) * 100}%`;

    const legend = fragment.querySelector(".viewer-statement-card__legend");
    legend.appendChild(createLegendItem("+2", "viewer-legend-item--support-strong", breakdown.supportStrong));
    legend.appendChild(createLegendItem("+1", "viewer-legend-item--support-partial", breakdown.supportPartial));
    legend.appendChild(createLegendItem("-1", "viewer-legend-item--contradict-partial", breakdown.contradictPartial));
    legend.appendChild(createLegendItem("-2", "viewer-legend-item--contradict-strong", breakdown.contradictStrong));

    if (originalIndex === state.statementIndex) {
      const summaryDetails = createStatementSummaryDetails(statement);
      legend.insertAdjacentElement("afterend", summaryDetails);

      const actions = document.createElement("div");
      actions.className = "viewer-statement-card__actions";
      const evidenceButton = document.createElement("button");
      evidenceButton.type = "button";
      evidenceButton.className = "viewer-inline-evidence-button";
      evidenceButton.textContent = "Related studies";
      evidenceButton.addEventListener("click", (event) => {
        event.stopPropagation();
        state.statementIndex = originalIndex;
        state.filter = "all";
        openEvidenceOverlay();
      });
      actions.appendChild(evidenceButton);
      summaryDetails.insertAdjacentElement("afterend", actions);
    }

    card.addEventListener("click", () => {
      if (state.statementIndex === originalIndex) {
        state.statementIndex = -1;
        if (state.evidenceOverlayOpen) {
          closeEvidenceOverlay(false);
        }
      } else {
        state.statementIndex = originalIndex;
        state.filter = "all";
      }
      renderStatements();
      renderEvidenceOverlay();
    });
    card.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") {
        return;
      }
      event.preventDefault();
      card.click();
    });

    container.appendChild(fragment);
  });
}

function renderEvidenceCard(listEl, item, highlightSnippets = []) {
  const template = document.getElementById("evidenceTemplate");
  const fragment = template.content.cloneNode(true);
  const cardEl = fragment.querySelector(".viewer-evidence-card");
  const titleEl = fragment.querySelector(".viewer-evidence-card__title");
  const metaEl = fragment.querySelector(".viewer-evidence-card__meta");
  const abstractEl = fragment.querySelector(".viewer-evidence-card__abstract");
  const rationaleEl = fragment.querySelector(".viewer-evidence-card__rationale");
  const pillEl = fragment.querySelector(".viewer-score-pill");

  titleEl.innerHTML = item.pubmed_url
    ? `<a href="${item.pubmed_url}" target="_blank" rel="noreferrer">${escapeHtml(item.title)}</a>`
    : escapeHtml(item.title);

  const metaParts = [];
  if (item.related_pmid) {
    metaParts.push(`PMID ${escapeHtml(item.related_pmid)}`);
  }
  if (item.retrieval_score !== undefined && item.retrieval_score !== null) {
    metaParts.push(`similarity score ${escapeHtml(String(item.retrieval_score))}`);
  }
  if (highlightSnippets.length) {
    metaParts.push("LLM-highlighted");
    cardEl.classList.add("viewer-evidence-card--highlighted");
  }
  metaEl.textContent = metaParts.join(" • ");
  abstractEl.innerHTML = highlightAbstractText(item.abstract, highlightSnippets);
  rationaleEl.textContent = item.rationale || "No rationale text was captured in the Med-V1 output.";

  pillEl.textContent = `${item.score_label} (${item.score ?? "?"})`;
  pillEl.classList.add(item.bucket === "support" ? "viewer-score-pill--support" : "viewer-score-pill--contradict");

  listEl.appendChild(fragment);
}

function renderFilters(statement) {
  const filterRow = document.getElementById("filterRow");
  filterRow.innerHTML = "";

  const supportCount = statement.evidence.filter((item) => item.bucket === "support").length;
  const contradictCount = statement.evidence.filter((item) => item.bucket === "contradict").length;
  const visibleTotal = supportCount + contradictCount;

  const options = [
    { key: "all", label: `All (${visibleTotal})` },
    { key: "support", label: `Support (${supportCount})` },
    { key: "contradict", label: `Contradict (${contradictCount})` },
  ];

  for (const option of options) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "viewer-filter-chip";
    if (state.filter === option.key) {
      button.classList.add("is-active");
    }
    button.textContent = option.label;
    button.addEventListener("click", () => {
      state.filter = option.key;
      renderEvidenceOverlay();
    });
    filterRow.appendChild(button);
  }
}

function renderEvidenceSortControl() {
  const select = document.getElementById("evidenceSortSelect");
  if (!select.dataset.bound) {
    select.addEventListener("change", (event) => {
      state.evidenceSort = event.target.value;
      renderEvidenceOverlay();
    });
    select.dataset.bound = "true";
  }
  select.value = state.evidenceSort;
}

function renderEvidenceOverlay() {
  const statement = getCurrentStatement();
  const supportList = document.getElementById("supportEvidenceList");
  const contradictList = document.getElementById("contradictEvidenceList");
  const supportSection = document.querySelector(".viewer-evidence-group--support");
  const contradictSection = document.querySelector(".viewer-evidence-group--contradict");
  const supportTitle = supportSection.querySelector(".viewer-group-title");
  const contradictTitle = contradictSection.querySelector(".viewer-group-title");
  supportList.innerHTML = "";
  contradictList.innerHTML = "";

  if (!statement) {
    closeEvidenceOverlay(false);
    document.getElementById("evidenceTitle").textContent = "Support/Contradict related studies";
    document.getElementById("evidenceSubtitle").textContent = "Choose a statement to inspect its related studies.";
    document.getElementById("filterRow").innerHTML = "";
    supportSection.hidden = false;
    contradictSection.hidden = false;
    supportList.innerHTML = '<div class="viewer-empty-state">No support evidence available.</div>';
    contradictList.innerHTML = '<div class="viewer-empty-state">No contradict evidence available.</div>';
    return;
  }

  document.getElementById("evidenceTitle").textContent =
    `Support/Contradict related studies for statement ${statement.idx + 1}`;
  document.getElementById("evidenceSubtitle").textContent = statement.text;
  renderFilters(statement);
  renderEvidenceSortControl();

  const supportEvidence = [];
  const contradictEvidence = [];
  const highlightLookup = buildHighlightLookup(statement);

  for (const item of statement.evidence || []) {
    if (item.bucket === "support") {
      supportEvidence.push(item);
    } else if (item.bucket === "contradict") {
      contradictEvidence.push(item);
    }
  }

  const mergeAllEvidence = shouldMergeAllEvidence();
  supportTitle.textContent = mergeAllEvidence ? "All" : "Support";
  contradictTitle.textContent = "Contradict";

  if (mergeAllEvidence) {
    const mergedEvidence = sortEvidenceItems([...supportEvidence, ...contradictEvidence]);
    supportSection.hidden = false;
    contradictSection.hidden = true;

    if (!mergedEvidence.length) {
      supportList.innerHTML = '<div class="viewer-empty-state">No related studies for this statement.</div>';
    } else {
      mergedEvidence.forEach((item) =>
        renderEvidenceCard(
          supportList,
          item,
          item.bucket === "support"
            ? highlightLookup.support.get(String(item.related_pmid || "")) || []
            : highlightLookup.contradict.get(String(item.related_pmid || "")) || []
        )
      );
    }
    return;
  }

  supportSection.hidden = state.filter === "contradict";
  contradictSection.hidden = state.filter === "support";

  if (!supportEvidence.length) {
    supportList.innerHTML = '<div class="viewer-empty-state">No supporting related studies for this statement.</div>';
  } else {
    sortEvidenceItems(supportEvidence).forEach((item) =>
      renderEvidenceCard(supportList, item, highlightLookup.support.get(String(item.related_pmid || "")) || [])
    );
  }

  if (!contradictEvidence.length) {
    contradictList.innerHTML = '<div class="viewer-empty-state">No contradicting related studies for this statement.</div>';
  } else {
    sortEvidenceItems(contradictEvidence).forEach((item) =>
      renderEvidenceCard(contradictList, item, highlightLookup.contradict.get(String(item.related_pmid || "")) || [])
    );
  }
}

function setEvidenceOverlayVisibility(isOpen) {
  const overlay = document.getElementById("statementEvidenceOverlay");
  const shouldOpen = Boolean(isOpen && getCurrentStatement());
  state.evidenceOverlayOpen = shouldOpen;
  overlay.hidden = !shouldOpen;
  overlay.setAttribute("aria-hidden", shouldOpen ? "false" : "true");
  document.body.classList.toggle("viewer-dialog-open", shouldOpen);
}

function openEvidenceOverlay() {
  if (!getCurrentStatement()) {
    return;
  }
  renderEvidenceOverlay();
  setEvidenceOverlayVisibility(true);
}

function closeEvidenceOverlay(shouldRender = true) {
  setEvidenceOverlayVisibility(false);
  if (shouldRender) {
    renderEvidenceOverlay();
  }
}

function setupActions() {
  const overlay = document.getElementById("statementEvidenceOverlay");
  const closeButton = document.getElementById("closeStatementEvidenceAction");
  closeButton.addEventListener("click", () => closeEvidenceOverlay());

  overlay.addEventListener("click", (event) => {
    if (event.target === overlay) {
      closeEvidenceOverlay();
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !overlay.hidden) {
      closeEvidenceOverlay();
    }
  });
}

function render() {
  renderPageTabs();
  renderHeader();
  renderAbstract();
  renderStatements();
  renderEvidenceOverlay();
}

async function init() {
  state.dataPath = normalizeDataPath(getQueryParam("data") || "./viewer_data.json");
  const [dataResponse, authorsResponse, statementSummariesByKey] = await Promise.all([
    loadJsonWithSessionCache(state.dataPath),
    loadJsonWithSessionCache("./authors_cache.json").catch(() => null),
    loadStatementSummaries(getSummaryPathForDataPath(state.dataPath)),
  ]);
  state.data = dataResponse;
  state.data.sources = [...(state.data.sources || [])].sort((a, b) =>
    comparePmidsAscending(a?.pmid, b?.pmid)
  );
  state.statementSummariesByKey = statementSummariesByKey;
  attachStatementSummaries();
  if (authorsResponse) {
    state.authorsByPmid = authorsResponse;
  } else {
    state.authorsByPmid = {};
  }
  if (!state.data.sources?.length) {
    throw new Error("Viewer dataset contains no source articles.");
  }

  const requestedPmid = getQueryParam("pmid");
  if (requestedPmid) {
    const matchIndex = state.data.sources.findIndex((source) => source.pmid === requestedPmid);
    if (matchIndex >= 0) {
      state.sourceIndex = matchIndex;
    }
  }
  const requestedStatementIndex = parseOptionalNonNegativeInt(getQueryParam("statement_idx"));
  if (requestedStatementIndex !== null) {
    const source = getCurrentSource();
    if (source?.statements?.[requestedStatementIndex]) {
      state.statementIndex = requestedStatementIndex;
    }
  }

  renderDatasetPicker();
  renderSourcePicker();
  setupActions();
  setQueryParam("pmid", getCurrentSource()?.pmid || "");
  renderPageTabs();
  render();
  if (getQueryParam("open_statement_support") === "1") {
    document.getElementById("statement-support").scrollIntoView({ behavior: "auto", block: "start" });
  }
}

init().catch((error) => {
  const main = document.getElementById("article-details");
  main.innerHTML = `<div class="viewer-empty-state">${escapeHtml(error.message)}</div>`;
});

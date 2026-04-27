const DATASET_OPTIONS = [
  { file: "./viewer_data_demo_examples.json", label: "Demo examples", summaryFile: "./demo_examples_summaries.jsonl" },
  { file: "./viewer_data.json", label: "Retracted articles", summaryFile: "./retracted_summaries.jsonl" },
  { file: "./viewer_data_amd.json", label: "AMD cases", summaryFile: "./amd_summaries.jsonl" },
  { file: "./viewer_data_oph1.json", label: "Ophthalmology cases", summaryFile: "./oph1_summaries.jsonl" },
  { file: "./viewer_data_oph1_pubmed.json", label: "Ophthalmology cases (PubMed)", summaryFile: "./oph1_pubmed_summaries.jsonl" },
  { file: "./viewer_data_retracted_rand_matches.json", label: "retracted_rand_matches", summaryFile: "./retracted_rand_matches_summaries.jsonl" },
  { file: "./viewer_data_retracted_rand.json", label: "retracted_rand", summaryFile: "./retracted_rand_summaries.jsonl" },
  { file: "./viewer_data_retracted_rand_litsense.json", label: "retracted_rand_litsense", summaryFile: "./retracted_rand_litsense_summaries.jsonl" },
  { file: "./viewer_data_cochrane.json", label: "cochrane", summaryFile: "./cochrane_summaries.jsonl" },
  { file: "./viewer_data_cochrane_litsense.json", label: "cochrane_litsense", summaryFile: "./cochrane_litsense_summaries.jsonl" },
];
const VIEWER_CACHE_VERSION = "20260421c";

const state = {
  data: null,
  dataPath: "./viewer_data_demo_examples.json",
  statementSummariesByKey: {},
  minTotalArticles: 5,
  rankingMetric: "contradict_rate",
  filter: "all",
  evidenceSort: "default",
  selectedRecord: null,
};

function getQueryParam(name) {
  return new URLSearchParams(window.location.search).get(name);
}

function normalizeDataPath(dataPath) {
  if (!dataPath) {
    return "./viewer_data_demo_examples.json";
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

function normalizeRankingMetric(value) {
  if (value === "controversy" || value === "directional") {
    return value;
  }
  return "contradict_rate";
}

function escapeHtml(text) {
  return String(text ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function setQueryParam(name, value) {
  const url = new URL(window.location.href);
  if (value === null || value === undefined || value === "") {
    url.searchParams.delete(name);
  } else {
    url.searchParams.set(name, value);
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
      statement.summary =
        state.statementSummariesByKey[getSummaryKey(source.pmid, statement.idx)] || null;
    }
  }
}

function buildPageUrl(pagePath, extraParams = {}) {
  const url = new URL(pagePath, window.location.href);
  url.searchParams.set("data", state.dataPath.replace("./", ""));
  if (state.minTotalArticles > 0) {
    url.searchParams.set("min_total", String(state.minTotalArticles));
  }
  url.searchParams.set("rank_metric", state.rankingMetric);
  for (const [key, value] of Object.entries(extraParams)) {
    if (value === null || value === undefined || value === "") {
      url.searchParams.delete(key);
    } else {
      url.searchParams.set(key, String(value));
    }
  }
  return url.toString();
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

function getDerivedSummaryScores(summary) {
  const numericSupportScore = Number(summary?.support_score);
  const numericContradictScore = Number(summary?.contradict_score);
  const hasNumericScores =
    Number.isFinite(numericSupportScore) && Number.isFinite(numericContradictScore);

  return {
    hasNumericScores,
    supportScore: hasNumericScores ? numericSupportScore : null,
    contradictScore: hasNumericScores ? numericContradictScore : null,
    controversyScore: hasNumericScores
      ? ((numericSupportScore + numericContradictScore) *
          Math.min(numericSupportScore, numericContradictScore)) / 50
      : null,
    directionalScore:
      hasNumericScores && (numericSupportScore + numericContradictScore) !== 0
        ? (numericSupportScore - numericContradictScore) /
          (numericSupportScore + numericContradictScore)
        : null,
  };
}

function getRankingMetricLabel(metric = state.rankingMetric) {
  if (metric === "controversy") {
    return "Controversy score";
  }
  if (metric === "directional") {
    return "Directional score";
  }
  return "Contradiction proportion";
}

function formatRankingMetricValue(metric, record) {
  if (metric === "controversy") {
    return record.controversyScore === null ? "NA" : record.controversyScore.toFixed(3);
  }
  if (metric === "directional") {
    return record.directionalScore === null ? "NA" : record.directionalScore.toFixed(3);
  }
  return `${record.contradictCount}/${record.total}`;
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
  const { hasNumericScores, controversyScore, directionalScore } =
    getDerivedSummaryScores(summary);
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
    state.dataPath = event.target.value;
    window.location.href = buildPageUrl("./statement_ranking.html");
  });
}

function renderPageTabs() {
  const articleViewTabLink = document.getElementById("articleViewTabLink");
  const rankingViewTabLink = document.getElementById("rankingViewTabLink");
  const articleRankingLink = document.getElementById("articleRankingLink");
  articleViewTabLink.href = buildPageUrl("./index.html");
  rankingViewTabLink.href = buildPageUrl("./statement_ranking.html");
  if (articleRankingLink) {
    articleRankingLink.href = buildPageUrl("./article_ranking.html");
  }
}

function renderThresholdControl() {
  const input = document.getElementById("minTotalArticlesInput");
  if (!input.dataset.bound) {
    const updateThreshold = (event) => {
      state.minTotalArticles = normalizeNonNegativeInt(event.target.value, 5);
      input.value = String(state.minTotalArticles);
      setQueryParam("min_total", String(state.minTotalArticles));
      renderPageTabs();
      renderRanking();
    };
    input.addEventListener("input", updateThreshold);
    input.addEventListener("change", updateThreshold);
    input.dataset.bound = "true";
  }
  input.value = String(state.minTotalArticles);
}

function renderRankingMetricControl() {
  const select = document.getElementById("rankingMetricSelect");
  if (!select.dataset.bound) {
    select.addEventListener("change", (event) => {
      state.rankingMetric = normalizeRankingMetric(event.target.value);
      setQueryParam("rank_metric", state.rankingMetric);
      renderPageTabs();
      renderRanking();
    });
    select.dataset.bound = "true";
  }
  select.value = state.rankingMetric;
}

function renderEvidenceSortControl() {
  const select = document.getElementById("rankingEvidenceSortSelect");
  if (!select.dataset.bound) {
    select.addEventListener("change", (event) => {
      state.evidenceSort = event.target.value;
      renderOverlayEvidence();
    });
    select.dataset.bound = "true";
  }
  select.value = state.evidenceSort;
}

function renderOverlayFilters(record) {
  const filterRow = document.getElementById("rankingFilterRow");
  filterRow.innerHTML = "";

  const supportCount = record.statement.evidence.filter((item) => item.bucket === "support").length;
  const contradictCount = record.statement.evidence.filter((item) => item.bucket === "contradict").length;
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
      renderOverlayEvidence();
    });
    filterRow.appendChild(button);
  }
}

function getRankedStatementsAcrossSources() {
  const ranked = [];
  for (const source of state.data?.sources || []) {
    for (const statement of source.statements || []) {
      const total = statement.counts?.total || 0;
      if (total <= state.minTotalArticles) {
        continue;
      }
      const contradictCount = statement.counts?.contradict || 0;
      const contradictRate = total > 0 ? contradictCount / total : 0;
      const derivedScores = getDerivedSummaryScores(statement.summary);
      ranked.push({
        source,
        statement,
        total,
        contradictCount,
        contradictRate,
        controversyScore: derivedScores.controversyScore,
        directionalScore: derivedScores.directionalScore,
      });
    }
  }

  ranked.sort((a, b) => {
    if (state.rankingMetric === "controversy") {
      const aHasScore = a.controversyScore !== null;
      const bHasScore = b.controversyScore !== null;
      if (aHasScore !== bHasScore) {
        return aHasScore ? -1 : 1;
      }
      if (aHasScore && bHasScore && b.controversyScore !== a.controversyScore) {
        return b.controversyScore - a.controversyScore;
      }
    } else if (state.rankingMetric === "directional") {
      const aHasScore = a.directionalScore !== null;
      const bHasScore = b.directionalScore !== null;
      if (aHasScore !== bHasScore) {
        return aHasScore ? -1 : 1;
      }
      if (aHasScore && bHasScore && a.directionalScore !== b.directionalScore) {
        return a.directionalScore - b.directionalScore;
      }
    }
    if (b.contradictRate !== a.contradictRate) {
      return b.contradictRate - a.contradictRate;
    }
    if (b.total !== a.total) {
      return b.total - a.total;
    }
    if (b.contradictCount !== a.contradictCount) {
      return b.contradictCount - a.contradictCount;
    }
    if (a.source.pmid !== b.source.pmid) {
      return a.source.pmid.localeCompare(b.source.pmid);
    }
    return a.statement.idx - b.statement.idx;
  });

  return ranked;
}

function renderOverlayEvidence() {
  const record = state.selectedRecord;
  const supportList = document.getElementById("rankingSupportEvidenceList");
  const contradictList = document.getElementById("rankingContradictEvidenceList");
  const supportSection = document.querySelector("#rankingStatementOverlay .viewer-evidence-group--support");
  const contradictSection = document.querySelector("#rankingStatementOverlay .viewer-evidence-group--contradict");
  const supportTitle = supportSection.querySelector(".viewer-group-title");
  const contradictTitle = contradictSection.querySelector(".viewer-group-title");
  supportList.innerHTML = "";
  contradictList.innerHTML = "";

  if (!record) {
    document.getElementById("rankingEvidenceTitle").textContent = "Support/Contradict related studies";
    document.getElementById("rankingEvidenceSubtitle").textContent = "Select a statement to inspect its related studies.";
    document.getElementById("rankingFilterRow").innerHTML = "";
    supportSection.hidden = false;
    contradictSection.hidden = false;
    supportList.innerHTML = '<div class="viewer-empty-state">No support evidence available.</div>';
    contradictList.innerHTML = '<div class="viewer-empty-state">No contradict evidence available.</div>';
    return;
  }

  document.getElementById("rankingEvidenceTitle").textContent = `Support/Contradict related studies for statement ${record.statement.idx + 1}`;
  document.getElementById("rankingEvidenceSubtitle").textContent = record.statement.text;
  renderOverlayFilters(record);
  renderEvidenceSortControl();

  const supportEvidence = [];
  const contradictEvidence = [];
  const highlightLookup = buildHighlightLookup(record.statement);
  for (const item of record.statement.evidence || []) {
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

function renderSelectedStatementOverlay() {
  const record = state.selectedRecord;
  if (!record) {
    return;
  }

  const breakdown = getScoreBreakdown(record.statement);
  const total =
    breakdown.supportStrong +
    breakdown.supportPartial +
    breakdown.contradictPartial +
    breakdown.contradictStrong || 1;
  const sourceArticleUrl = buildPageUrl("./index.html", {
    pmid: record.source.pmid,
    statement_idx: record.statement.idx,
    open_statement_support: "1",
  });

  document.getElementById("rankingStatementSource").innerHTML =
    `Source PMID <a href="${sourceArticleUrl}"><strong>${escapeHtml(record.source.pmid)}</strong></a> • ${escapeHtml(record.source.title)}`;
  document.getElementById("rankingStatementIndex").textContent = `Statement ${record.statement.idx + 1}`;
  document.getElementById("rankingStatementTotals").textContent =
    `${Math.round(record.contradictRate * 100)}% contradict • ${record.contradictCount}/${record.total} contradict`;
  document.getElementById("rankingStatementText").textContent = record.statement.text;

  document.getElementById("rankingSupportStrongSegment").style.width = `${(breakdown.supportStrong / total) * 100}%`;
  document.getElementById("rankingSupportPartialSegment").style.width = `${(breakdown.supportPartial / total) * 100}%`;
  document.getElementById("rankingContradictPartialSegment").style.width = `${(breakdown.contradictPartial / total) * 100}%`;
  document.getElementById("rankingContradictStrongSegment").style.width = `${(breakdown.contradictStrong / total) * 100}%`;

  const legend = document.getElementById("rankingStatementLegend");
  legend.innerHTML = "";
  legend.appendChild(createLegendItem("+2", "viewer-legend-item--support-strong", breakdown.supportStrong));
  legend.appendChild(createLegendItem("+1", "viewer-legend-item--support-partial", breakdown.supportPartial));
  legend.appendChild(createLegendItem("-1", "viewer-legend-item--contradict-partial", breakdown.contradictPartial));
  legend.appendChild(createLegendItem("-2", "viewer-legend-item--contradict-strong", breakdown.contradictStrong));

  const summaryHost = document.getElementById("rankingStatementSummary");
  summaryHost.innerHTML = "";
  summaryHost.appendChild(createStatementSummaryDetails(record.statement));

  renderOverlayEvidence();
}

function setupOverlay() {
  const overlay = document.getElementById("rankingStatementOverlay");
  const closeButton = document.getElementById("closeRankingStatementOverlay");

  const openOverlay = () => {
    overlay.hidden = false;
    overlay.setAttribute("aria-hidden", "false");
    document.body.classList.add("viewer-dialog-open");
  };

  const closeOverlay = () => {
    overlay.hidden = true;
    overlay.setAttribute("aria-hidden", "true");
    document.body.classList.remove("viewer-dialog-open");
  };

  closeButton.addEventListener("click", closeOverlay);
  overlay.addEventListener("click", (event) => {
    if (event.target === overlay) {
      closeOverlay();
    }
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !overlay.hidden) {
      closeOverlay();
    }
  });

  return { openOverlay, closeOverlay };
}

function renderRanking() {
  const summary = document.getElementById("rankingSummary");
  const container = document.getElementById("globalStatementList");
  const template = document.getElementById("globalStatementTemplate");
  container.innerHTML = "";

  const ranked = getRankedStatementsAcrossSources();
  if (!ranked.length) {
    summary.textContent = `No statements have more than ${state.minTotalArticles} support/contradict articles in this dataset.`;
    container.innerHTML = '<div class="viewer-empty-state">Try lowering the minimum total articles threshold.</div>';
    return;
  }

  if (state.rankingMetric === "controversy") {
    summary.textContent = `${ranked.length} statements currently meet the threshold and are ranked by highest controversy score. Statements without support/contradict summary scores fall to the bottom.`;
  } else if (state.rankingMetric === "directional") {
    summary.textContent = `${ranked.length} statements currently meet the threshold and are ranked by lowest directional score first, so the most contradiction-leaning statements appear first.`;
  } else {
    summary.textContent = `${ranked.length} statements currently meet the threshold and are ranked by contradiction proportion. Click any statement to inspect its support and contradict studies here.`;
  }

  ranked.forEach(({ source, statement, total, contradictCount, contradictRate, controversyScore, directionalScore }, index) => {
    const fragment = template.content.cloneNode(true);
    const card = fragment.querySelector(".viewer-ranking-card");
    const isSelected =
      state.selectedRecord &&
      state.selectedRecord.source.pmid === source.pmid &&
      state.selectedRecord.statement.idx === statement.idx;
    const breakdown = getScoreBreakdown(statement);
    const visibleTotal =
      breakdown.supportStrong +
      breakdown.supportPartial +
      breakdown.contradictPartial +
      breakdown.contradictStrong;
    const distributionTotal = visibleTotal || 1;

    card.classList.toggle("is-active", Boolean(isSelected));
    fragment.querySelector(".viewer-statement-card__index").textContent = `Rank ${index + 1}`;
    const metricRecord = {
      contradictRate,
      contradictCount,
      total,
      controversyScore,
      directionalScore,
    };
    fragment.querySelector(".viewer-statement-card__totals").textContent =
      state.rankingMetric === "contradict_rate"
        ? `${formatRankingMetricValue(state.rankingMetric, metricRecord)} contradict`
        : `${getRankingMetricLabel()} ${formatRankingMetricValue(state.rankingMetric, metricRecord)} • ${contradictCount}/${total} contradict`;
    fragment.querySelector(".viewer-ranking-card__source").innerHTML =
      `<strong>Source PMID ${escapeHtml(source.pmid)}</strong> • ${escapeHtml(source.title)} • Statement ${statement.idx + 1}`;
    fragment.querySelector(".viewer-statement-card__text").textContent = statement.text;

    fragment.querySelector(".viewer-distribution__segment--support-strong").style.width =
      `${(breakdown.supportStrong / distributionTotal) * 100}%`;
    fragment.querySelector(".viewer-distribution__segment--support-partial").style.width =
      `${(breakdown.supportPartial / distributionTotal) * 100}%`;
    fragment.querySelector(".viewer-distribution__segment--contradict-partial").style.width =
      `${(breakdown.contradictPartial / distributionTotal) * 100}%`;
    fragment.querySelector(".viewer-distribution__segment--contradict-strong").style.width =
      `${(breakdown.contradictStrong / distributionTotal) * 100}%`;

    const legend = fragment.querySelector(".viewer-statement-card__legend");
    legend.appendChild(createLegendItem("+2", "viewer-legend-item--support-strong", breakdown.supportStrong));
    legend.appendChild(createLegendItem("+1", "viewer-legend-item--support-partial", breakdown.supportPartial));
    legend.appendChild(createLegendItem("-1", "viewer-legend-item--contradict-partial", breakdown.contradictPartial));
    legend.appendChild(createLegendItem("-2", "viewer-legend-item--contradict-strong", breakdown.contradictStrong));

    card.addEventListener("click", () => {
      const isSameSelection =
        state.selectedRecord &&
        state.selectedRecord.source.pmid === source.pmid &&
        state.selectedRecord.statement.idx === statement.idx;

      if (isSameSelection) {
        state.selectedRecord = null;
        state.overlayControls.closeOverlay();
        renderRanking();
        return;
      }

      state.selectedRecord = { source, statement, total, contradictCount, contradictRate };
      state.filter = "all";
      renderRanking();
      renderSelectedStatementOverlay();
      state.overlayControls.openOverlay();
    });

    container.appendChild(fragment);
  });
}

async function init() {
  state.dataPath = normalizeDataPath(getQueryParam("data") || "./viewer_data_demo_examples.json");
  state.minTotalArticles = normalizeNonNegativeInt(getQueryParam("min_total"), 5);
  state.rankingMetric = normalizeRankingMetric(getQueryParam("rank_metric"));

  const [data, statementSummariesByKey] = await Promise.all([
    loadJsonWithSessionCache(state.dataPath),
    loadStatementSummaries(getSummaryPathForDataPath(state.dataPath)),
  ]);
  state.data = data;
  state.data.sources = [...(state.data.sources || [])].sort((a, b) =>
    comparePmidsAscending(a?.pmid, b?.pmid)
  );
  state.statementSummariesByKey = statementSummariesByKey;
  attachStatementSummaries();
  if (!state.data.sources?.length) {
    throw new Error("Viewer dataset contains no source articles.");
  }

  renderDatasetPicker();
  renderRankingMetricControl();
  renderThresholdControl();
  renderPageTabs();
  state.overlayControls = setupOverlay();
  renderRanking();
}

init().catch((error) => {
  const main = document.getElementById("ranking-main");
  main.innerHTML = `<div class="viewer-empty-state">${escapeHtml(error.message)}</div>`;
});

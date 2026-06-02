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
  { file: "./viewer_data_vitb_general_claims_gpt54_medium.json", label: "vitamin b statements", summaryFile: "./vitb_general_claims_gpt54_medium_summaries.jsonl" },
  { file: "./viewer_data_vitb_amd_general_claims_related_passages_gpt54_medium2.json", label: "vitamin b passages", summaryFile: "./vitb_amd_general_claims_related_passages_summaries2.jsonl", evidenceTextLabel: "Passage" },
  { file: "./viewer_data_vitb_amd_general_claims_fulltext_gpt54_medium.json", label: "vitamin b full texts", summaryFile: "./vitb_amd_general_claims_fulltext_summaries.jsonl" },
  { file: "./viewer_data_vitb_amd_general_claims_litsense1000_noreviews_gpt54_medium.json", label: "vitamin b litsense 1000", summaryFile: "./vitb_amd_general_claims_litsense1000_noreviews_summaries.jsonl" },
  { file: "./viewer_data_vitb_amd_general_claims_litsense1000_noreviews_plus_systematic_meta_gpt54_medium.json", label: "vitamin b litsense 1000 with systematic reviews", summaryFile: "./vitb_amd_general_claims_litsense1000_noreviews_sys_meta_no_abstract_summaries.jsonl" },
  { file: "./viewer_data_glp1_out2.json", label: "GLP-1 statements", summaryFile: "./glp1_noabstract_summaries.jsonl" },
  { file: "./viewer_data_glp1_comp_out.json", label: "GLP-1 snippet spans" },
  { file: "./viewer_data_covid_eg_out.json", label: "COVID example statements", summaryFile: "./covid_eg_noabstract_summaries.jsonl" },
  { file: "./viewer_data_harris_article_snippet_spans_gpt54_medium.json", label: "Harris snippet spans" },
  { file: "./viewer_data_cell_out.json", label: "Cell snippet spans" },
];

const state = {
  data: null,
  summariesByKey: {},
  dataPath: "./viewer_data_glp1_out2.json",
  sourceIndex: 0,
  statementIndex: null,
  hoveredStatementIndex: null,
  sidebarStatementFilterIndexes: null,
  activeAnchorStatementIndexes: null,
  evidenceOverlayOpen: false,
  filter: "all",
};

function getQueryParam(name) {
  return new URLSearchParams(window.location.search).get(name);
}

function normalizeDataPath(dataPath) {
  if (!dataPath) {
    return "./viewer_data_glp1_out2.json";
  }
  return dataPath.startsWith("./") ? dataPath : `./${dataPath}`;
}

function getDatasetOption(dataPath = state.dataPath) {
  return DATASET_OPTIONS.find((dataset) => dataset.file === dataPath) || null;
}

function escapeHtml(text) {
  return String(text ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatConcernLabel(text) {
  return String(text ?? "")
    .replace(/\bContradicting\b/g, "Concerns")
    .replace(/\bcontradicting\b/g, "concerns")
    .replace(/\bContradicted\b/g, "Concern")
    .replace(/\bcontradicted\b/g, "concerns")
    .replace(/\bContradiction\b/g, "Concern")
    .replace(/\bcontradiction\b/g, "concern")
    .replace(/\bContradict\b/g, "Concerns")
    .replace(/\bcontradict\b/g, "concerns");
}

function buildPageUrl(page, overrides = {}) {
  const url = new URL(page, window.location.href);
  url.searchParams.set("data", overrides.data || state.dataPath);
  const source = getCurrentSource();
  const pmid = Object.prototype.hasOwnProperty.call(overrides, "pmid")
    ? overrides.pmid
    : source?.pmid;
  if (pmid) {
    url.searchParams.set("pmid", pmid);
  }
  return `${url.pathname.split("/").pop()}${url.search}`;
}

async function loadJson(path) {
  const response = await fetch(path, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Failed to load ${path}: ${response.status}`);
  }
  return response.json();
}

async function loadJsonl(path) {
  const response = await fetch(path, { cache: "no-store" });
  if (!response.ok) {
    return [];
  }
  const text = await response.text();
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function summaryKey(sourcePmid, statementIdx) {
  return `${sourcePmid}::${statementIdx}`;
}

function attachSummaries() {
  for (const source of state.data.sources || []) {
    for (const statement of source.statements || []) {
      statement.summary = state.summariesByKey[summaryKey(source.pmid, statement.idx)] || null;
    }
  }
}

function applySidebarSourceOverride() {
  const config = state.data?.sidebar_source;
  if (!config?.combine_sources) {
    return;
  }

  const anchors = config.statement_anchors || {};
  const combinedStatements = [];
  for (const source of state.data.sources || []) {
    for (const statement of source.statements || []) {
      const originalKey = summaryKey(source.pmid, statement.idx);
      combinedStatements.push({
        ...statement,
        idx: combinedStatements.length,
        original_source_pmid: source.pmid,
        original_statement_idx: statement.idx,
        text_anchor: anchors[originalKey] || statement.text_anchor || "",
      });
    }
  }

  state.data.sources = [
    {
      pmid: config.pmid || "combined_source",
      title: config.title || "Evidence synthesis",
      abstract: config.abstract || "",
      pubmed_url: config.pubmed_url || "",
      statements: combinedStatements,
    },
  ];
  state.data.source_count = 1;
}

function getCurrentSource() {
  return state.data?.sources?.[state.sourceIndex] || null;
}

function getCurrentStatement() {
  const source = getCurrentSource();
  if (state.statementIndex === null || state.statementIndex === undefined) {
    return null;
  }
  return source?.statements?.[state.statementIndex] || null;
}

function scoreClass(item) {
  return item.bucket === "support" ? "viewer-score-pill--support" : "viewer-score-pill--contradict";
}

function scoreLabel(item) {
  return `${formatConcernLabel(item.score_label || "Score")} (${item.score ?? "?"})`;
}

function snippetScoreClass(snippet) {
  const score = Number(snippet?.score ?? snippet?.extracted_score);
  if (score >= 2) {
    return "sidebar-view-snippet-quote--strong-support";
  }
  if (score > 0) {
    return "sidebar-view-snippet-quote--partial-support";
  }
  if (score <= -2) {
    return "sidebar-view-snippet-quote--strong-contradict";
  }
  if (score < 0) {
    return "sidebar-view-snippet-quote--partial-contradict";
  }
  return "sidebar-view-snippet-quote--unknown";
}

function normalizeTextFragment(text) {
  return String(text || "").replace(/\s+/g, " ").trim();
}

function encodeTextFragment(text) {
  return encodeURIComponent(text)
    .replace(/%2F/gi, "/")
    .replace(/-/g, "%2D");
}

function buildSnippetContextUrl(item, snippet) {
  const text = normalizeTextFragment(snippet?.text || "");
  if (!text) {
    return "";
  }

  const pmcid = String(item?.pmcid || "").trim();
  const pmid = String(item?.related_pmid || "").trim();
  const hasFullText = Boolean(item?.fulltext_available && pmcid);
  const baseUrl = hasFullText
    ? `https://pmc.ncbi.nlm.nih.gov/articles/${encodeURIComponent(pmcid)}/`
    : item?.pubmed_url || (pmid ? `https://pubmed.ncbi.nlm.nih.gov/${encodeURIComponent(pmid)}/` : "");

  if (!baseUrl) {
    return "";
  }
  return `${baseUrl}#:~:text=${encodeTextFragment(text)}`;
}

function hasSnippetEvidence(statement = getCurrentStatement()) {
  return Boolean(
    state.data?.evidence_mode === "snippets" ||
      (statement?.evidence || []).some((item) => Array.isArray(item.snippets))
  );
}

function getScoreBreakdown(statement) {
  const breakdown = {
    supportStrong: 0,
    supportPartial: 0,
    contradictPartial: 0,
    contradictStrong: 0,
  };

  for (const item of statement?.evidence || []) {
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

function getContradictionProfileFromCounts(supportCount, contradictCount) {
  const support = Number(supportCount) || 0;
  const contradict = Number(contradictCount) || 0;
  const denominator = support + contradict;

  if (!denominator) {
    return {
      support,
      contradict,
      denominator,
      ratio: null,
      percent: 0,
      markerPercent: 0,
      color: "#6f7782",
      softColor: "#eff2f5",
      activeColor: "#d9dee5",
      borderColor: "#c6ccd3",
      label: "No support/concerns articles",
    };
  }

  const ratio = contradict / denominator;
  const hue = Math.round(132 - ratio * 132);
  const percent = Math.round(ratio * 100);
  const markerPercent = Math.min(98, Math.max(2, 100 - percent));
  return {
    support,
    contradict,
    denominator,
    ratio,
    percent,
    markerPercent,
    color: `hsl(${hue}, 62%, 38%)`,
    softColor: `hsl(${hue}, 72%, 91%)`,
    activeColor: `hsl(${hue}, 70%, 80%)`,
    borderColor: `hsl(${hue}, 58%, 46%)`,
    label: `${percent}% concerns`,
  };
}

function getContradictionProfile(statement) {
  const breakdown = getScoreBreakdown(statement);
  return getContradictionProfileFromCounts(
    breakdown.supportStrong + breakdown.supportPartial,
    breakdown.contradictPartial + breakdown.contradictStrong
  );
}

function getAggregateContradictionProfile(statements) {
  let support = 0;
  let contradict = 0;
  for (const statement of statements || []) {
    const profile = getContradictionProfile(statement);
    support += profile.support;
    contradict += profile.contradict;
  }
  return getContradictionProfileFromCounts(support, contradict);
}

function buildContradictionStyle(profile) {
  return [
    `--sidebar-evidence-color: ${profile.color}`,
    `--sidebar-evidence-soft: ${profile.softColor}`,
    `--sidebar-evidence-active: ${profile.activeColor}`,
    `--sidebar-evidence-border: ${profile.borderColor}`,
    `--sidebar-contradict-position: ${profile.markerPercent}%`,
  ].join("; ");
}

function getAnchorContradictionProfile(statements, statementIndexes) {
  const normalizedIndexes = normalizeStatementIndexes(statementIndexes, statements || []);
  const hasHoveredStatement = state.hoveredStatementIndex !== null && state.hoveredStatementIndex !== undefined;
  const hoveredIndex = hasHoveredStatement ? Number(state.hoveredStatementIndex) : null;
  if (hasHoveredStatement && normalizedIndexes.includes(hoveredIndex) && statements?.[hoveredIndex]) {
    return getContradictionProfile(statements[hoveredIndex]);
  }

  const hasSelectedStatement = state.statementIndex !== null && state.statementIndex !== undefined;
  const selectedIndex = hasSelectedStatement ? Number(state.statementIndex) : null;
  if (hasSelectedStatement && normalizedIndexes.includes(selectedIndex) && statements?.[selectedIndex]) {
    return getContradictionProfile(statements[selectedIndex]);
  }

  const firstEvidenceIndex = normalizedIndexes.find((index) => {
    const statement = statements?.[index];
    return statement && getContradictionProfile(statement).denominator > 0;
  });
  const firstIndex = firstEvidenceIndex ?? normalizedIndexes[0];
  if (statements?.[firstIndex]) {
    return getContradictionProfile(statements[firstIndex]);
  }

  return getAggregateContradictionProfile([]);
}

function normalizeStatementIndexes(indexes, statements = getCurrentSource()?.statements || []) {
  const maxIndex = statements.length - 1;
  return [...new Set(indexes.map((value) => Number(value)))]
    .filter((value) => Number.isInteger(value) && value >= 0 && value <= maxIndex)
    .sort((a, b) => a - b);
}

function statementIndexSetsEqual(left, right) {
  if (!left || !right || left.length !== right.length) {
    return false;
  }
  return left.every((value, index) => value === right[index]);
}

function getStatementIndexesFromElement(element) {
  return String(element.dataset.statementIndexes || "")
    .split(",")
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value));
}

function updateAnchorActiveState() {
  const activeIndexes = state.activeAnchorStatementIndexes;
  const selectedIndex = state.statementIndex !== null && state.statementIndex !== undefined
    ? Number(state.statementIndex)
    : null;
  const statements = getCurrentSource()?.statements || [];
  for (const mark of document.querySelectorAll(".viewer-source-highlight[data-statement-indexes]")) {
    const indexes = getStatementIndexesFromElement(mark);
    const active = statementIndexSetsEqual(indexes, activeIndexes) ||
      (selectedIndex !== null && indexes.includes(selectedIndex));
    mark.classList.toggle("is-active", active);
    mark.setAttribute("style", buildContradictionStyle(getAnchorContradictionProfile(statements, indexes)));
  }
}

function clearActiveAnchorHighlight() {
  state.activeAnchorStatementIndexes = null;
  updateAnchorActiveState();
}

function clearSidebarStatementFilter() {
  state.sidebarStatementFilterIndexes = null;
  state.activeAnchorStatementIndexes = null;
  render();
}

function firstStatementIndexWithEvidence(indexes, statements = getCurrentSource()?.statements || []) {
  return indexes.find((index) => {
    const statement = statements?.[index];
    return statement && getContradictionProfile(statement).denominator > 0;
  });
}

function setSidebarStatementFilter(indexes) {
  const normalized = normalizeStatementIndexes(indexes);
  state.sidebarStatementFilterIndexes = normalized.length ? normalized : null;
  state.activeAnchorStatementIndexes = normalized.length ? normalized : null;
  if (normalized.length && !normalized.includes(state.statementIndex)) {
    state.statementIndex = firstStatementIndexWithEvidence(normalized) ?? normalized[0];
  }
  state.filter = "all";
  closeEvidenceOverlay(false);
  render();
}

function updateAnchorHoverState() {
  const hoveredIndex = state.hoveredStatementIndex;
  const statements = getCurrentSource()?.statements || [];
  for (const mark of document.querySelectorAll(".viewer-source-highlight[data-statement-indexes]")) {
    const indexes = getStatementIndexesFromElement(mark);
    mark.classList.toggle("is-statement-hovered", indexes.includes(hoveredIndex));
    mark.setAttribute("style", buildContradictionStyle(getAnchorContradictionProfile(statements, indexes)));
  }
}

function getStatementEvidenceTotal(statement) {
  const articleKeys = new Set();
  let unkeyedArticles = 0;
  for (const item of statement?.evidence || []) {
    if (item.bucket !== "support" && item.bucket !== "contradict") {
      continue;
    }
    const key = String(item.related_pmid || item.title || "").trim();
    if (key) {
      articleKeys.add(key);
    } else {
      unkeyedArticles += 1;
    }
  }
  return articleKeys.size + unkeyedArticles;
}

function getMaxStatementEvidenceTotal(statements) {
  return Math.max(0, ...(statements || []).map((statement) => getStatementEvidenceTotal(statement)));
}

function getLogScaledEvidenceWidth(evidenceTotal, maxEvidenceTotal) {
  const total = Math.max(0, Number(evidenceTotal) || 0);
  const maxTotal = Math.max(0, Number(maxEvidenceTotal) || 0);
  if (!total || !maxTotal) {
    return 0;
  }
  const logRatio = Math.log1p(total) / Math.log1p(maxTotal);
  return Math.max(25, Math.min(100, logRatio * 100));
}

function buildDistributionBarStyle(profile, maxEvidenceTotal, evidenceTotal = profile.denominator) {
  const widthPercent = getLogScaledEvidenceWidth(evidenceTotal, maxEvidenceTotal);
  return [
    buildContradictionStyle(profile),
    `--sidebar-evidence-width: ${Math.max(0, Math.min(100, widthPercent)).toFixed(2)}%`,
  ].join("; ");
}

function renderDistributionBar(statement, maxEvidenceTotal) {
  const profile = getContradictionProfile(statement);
  const evidenceTotal = getStatementEvidenceTotal(statement);
  const ariaLabel = profile.denominator
    ? `${profile.label}: ${profile.contradict} concerns and ${profile.support} support articles, log-scaled to ${evidenceTotal} of ${maxEvidenceTotal || evidenceTotal} evidence articles`
    : profile.label;
  return `
    <div class="viewer-distribution sidebar-view-distribution sidebar-view-distribution--scale ${profile.denominator ? "" : "is-empty"}" style="${buildDistributionBarStyle(profile, maxEvidenceTotal, evidenceTotal)}" role="img" aria-label="${escapeHtml(ariaLabel)}">
      <span class="sidebar-view-distribution__track"></span>
      ${profile.denominator ? '<span class="sidebar-view-distribution__marker"></span>' : ""}
    </div>
    <div class="viewer-statement-card__legend sidebar-view-legend">
      <span class="viewer-legend-item">Concerns: ${profile.contradict}</span>
      <span class="viewer-legend-item">Support: ${profile.support}</span>
    </div>
  `;
}

function normalizeText(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function splitSentences(text) {
  const baseText = String(text || "");
  if (!baseText.trim()) {
    return [];
  }
  return baseText.match(/[^.!?\n]+(?:[.!?]+|$)|\n+/g) || [baseText];
}

function findBestSentenceIndexes(text, snippets) {
  const sentences = splitSentences(text);
  const normalizedSentences = sentences.map((sentence) => normalizeText(sentence));
  const indexes = new Set();

  for (const snippet of snippets.filter(Boolean)) {
    const normalizedSnippet = normalizeText(snippet);
    if (!normalizedSnippet) {
      continue;
    }
    const tokens = new Set(normalizedSnippet.split(" ").filter((token) => token.length >= 4));
    let bestIndex = -1;
    let bestScore = 0;

    normalizedSentences.forEach((sentence, index) => {
      if (!sentence) {
        return;
      }
      if (sentence.includes(normalizedSnippet) || normalizedSnippet.includes(sentence)) {
        bestIndex = index;
        bestScore = 1;
        return;
      }
      let overlap = 0;
      for (const token of tokens) {
        if (sentence.includes(token)) {
          overlap += 1;
        }
      }
      const score = overlap / Math.max(tokens.size, 1);
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

function highlightExactAnchors(text, statements) {
  const groupedMatches = new Map();
  for (const [statementIndex, statement] of statements.entries()) {
    const anchor = String(statement.text_anchor || "").trim();
    if (!anchor) {
      continue;
    }
    const start = text.indexOf(anchor);
    if (start >= 0) {
      const end = start + anchor.length;
      const key = `${start}:${end}`;
      if (!groupedMatches.has(key)) {
        groupedMatches.set(key, { start, end, statementIndexes: [] });
      }
      groupedMatches.get(key).statementIndexes.push(statementIndex);
    }
  }
  const matches = [...groupedMatches.values()];
  matches.sort((a, b) => a.start - b.start || b.end - a.end);

  const nonOverlapping = [];
  let lastEnd = -1;
  for (const match of matches) {
    if (match.start >= lastEnd) {
      nonOverlapping.push(match);
      lastEnd = match.end;
    }
  }
  if (!nonOverlapping.length) {
    return "";
  }

  let cursor = 0;
  let html = "";
  for (const match of nonOverlapping) {
    html += escapeHtml(text.slice(cursor, match.start));
    const active = statementIndexSetsEqual(match.statementIndexes, state.activeAnchorStatementIndexes);
    const profile = getAnchorContradictionProfile(statements, match.statementIndexes);
    html += `<mark class="viewer-source-highlight ${active ? "is-active" : ""}" style="${buildContradictionStyle(profile)}" data-statement-indexes="${escapeHtml(match.statementIndexes.join(","))}">${escapeHtml(text.slice(match.start, match.end))}</mark>`;
    cursor = match.end;
  }
  html += escapeHtml(text.slice(cursor));
  return html;
}

function highlightSourceText(text, statements) {
  const activeStatement = getCurrentStatement();
  const exactHtml = highlightExactAnchors(text, statements);
  if (exactHtml) {
    return exactHtml;
  }

  const snippets = activeStatement
    ? [activeStatement.text_anchor, activeStatement.text]
    : statements.map((statement) => statement.text_anchor || statement.text);
  const { sentences, indexes } = findBestSentenceIndexes(text, snippets);
  if (!indexes.size) {
    return escapeHtml(text);
  }
  const highlightProfile = activeStatement
    ? getContradictionProfile(activeStatement)
    : getAggregateContradictionProfile(statements);
  const highlightStyle = buildContradictionStyle(highlightProfile);
  return sentences
    .map((sentence, index) =>
      indexes.has(index)
        ? `<mark class="viewer-source-highlight is-active" style="${highlightStyle}">${escapeHtml(sentence)}</mark>`
        : escapeHtml(sentence)
    )
    .join("");
}

function renderPageTabs() {
  const source = getCurrentSource();
  const links = [
    ["articleViewTabLink", buildPageUrl("./index.html", { pmid: source?.pmid || "" })],
    ["globalRankingLink", buildPageUrl("./statement_ranking.html")],
    ["articleRankingLink", buildPageUrl("./article_ranking.html")],
    ["evidenceMapLink", buildPageUrl("./sidebar_view.html")],
  ];
  for (const [id, href] of links) {
    const link = document.getElementById(id);
    if (link) {
      link.href = href;
    }
  }
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
    window.location.href = buildPageUrl("./sidebar_view.html", { data: event.target.value, pmid: "" });
  });
}

function renderSourcePicker() {
  const select = document.getElementById("sourceSelect");
  select.innerHTML = "";
  for (const [index, source] of (state.data.sources || []).entries()) {
    const option = document.createElement("option");
    option.value = String(index);
    option.textContent = `${source.pmid} - ${source.title}`;
    option.selected = index === state.sourceIndex;
    select.appendChild(option);
  }
  select.addEventListener("change", (event) => {
    state.sourceIndex = Number(event.target.value);
    state.statementIndex = null;
    state.hoveredStatementIndex = null;
    state.sidebarStatementFilterIndexes = null;
    state.activeAnchorStatementIndexes = null;
    closeEvidenceOverlay(false);
    const source = getCurrentSource();
    const url = new URL(window.location.href);
    url.searchParams.set("pmid", source?.pmid || "");
    window.history.replaceState({}, "", url);
    render();
  });
}

function renderHeader() {
  const source = getCurrentSource();
  const dataset = getDatasetOption();
  const isSyntheticSidebarSource = Boolean(
    state.data?.sidebar_source?.combine_sources &&
      source?.pmid &&
      source.pmid === state.data.sidebar_source.pmid
  );
  document.title = `${dataset?.label || "Evidence"} - Sidebar View`;
  const termInput = document.getElementById("id_term");
  if (termInput) {
    termInput.value = source?.pmid || "";
  }
  document.getElementById("sidebarViewDataset").textContent = dataset?.label || state.dataPath.replace("./", "");
  const title = document.getElementById("sidebarViewTitle");
  title.textContent = source?.title || "Untitled source";
  title.hidden = isSyntheticSidebarSource;
  document.getElementById("sidebarViewPmid").textContent = source?.pmid || "-";
  document.querySelector(".sidebar-view-identifiers").hidden = isSyntheticSidebarSource;
  const pubmedLink = document.getElementById("sidebarViewPubmed");
  pubmedLink.href = source?.pubmed_url || "";
}

function renderSourceText() {
  const source = getCurrentSource();
  const container = document.getElementById("sidebarViewText");
  const textLabel = state.data?.sidebar_source?.text_label || getDatasetOption()?.evidenceTextLabel || "Abstract";
  document.getElementById("sidebarViewTextTitle").textContent = textLabel;

  const text = String(source?.abstract || "").trim();
  if (!text) {
    container.innerHTML = '<p class="viewer-placeholder-text">No source abstract text is available for this dataset row.</p>';
    return;
  }

  container.innerHTML = `<p>${highlightSourceText(text, source?.statements || [])}</p>`;
  for (const mark of container.querySelectorAll("[data-statement-indexes]")) {
    mark.addEventListener("click", () => {
      const indexes = getStatementIndexesFromElement(mark);
      if (!indexes.length) {
        return;
      }
      setSidebarStatementFilter(indexes);
    });
  }
}

function renderEvidenceCard(item) {
  const metaParts = [];
  if (item.related_pmid) {
    metaParts.push(`PMID ${item.related_pmid}`);
  }
  if (item.retrieval_score !== undefined && item.retrieval_score !== null) {
    metaParts.push(`similarity score ${item.retrieval_score}`);
  }

  return `
    <article class="viewer-evidence-card">
      <div class="viewer-evidence-card__header">
        <div>
          <h4 class="viewer-evidence-card__title">
            ${item.pubmed_url
              ? `<a href="${escapeHtml(item.pubmed_url)}" target="_blank" rel="noreferrer">${escapeHtml(item.title || "Related article")}</a>`
              : escapeHtml(item.title || "Related article")}
          </h4>
          <div class="viewer-evidence-card__meta">${escapeHtml(metaParts.join(" - "))}</div>
        </div>
        <span class="viewer-score-pill ${scoreClass(item)}">${escapeHtml(scoreLabel(item))}</span>
      </div>
      <details class="viewer-evidence-card__details">
        <summary>Abstract</summary>
        <p class="viewer-evidence-card__abstract">${escapeHtml(item.abstract || "No abstract text was available in the scored row.")}</p>
      </details>
      <details class="viewer-evidence-card__details">
        <summary>Med-V1 rationale</summary>
        <p class="viewer-evidence-card__rationale">${escapeHtml(item.rationale || "No rationale text was captured in the Med-V1 output.")}</p>
      </details>
    </article>
  `;
}

function renderSnippetEvidenceCard(item) {
  const metaParts = [];
  if (item.related_pmid) {
    metaParts.push(`PMID ${item.related_pmid}`);
  }

  const snippets = Array.isArray(item.snippets) ? item.snippets : [];
  const snippetHtml = snippets.length
    ? snippets.map((snippet) => {
        const contextUrl = buildSnippetContextUrl(item, snippet);
        return `
          <li class="sidebar-view-snippet-item">
            <blockquote class="${snippetScoreClass(snippet)}">${escapeHtml(snippet.text || "")}</blockquote>
            ${contextUrl ? `
              <div class="sidebar-view-snippet-item__actions">
                <a class="sidebar-view-snippet-context-link" href="${escapeHtml(contextUrl)}" target="_blank" rel="noreferrer">Show context</a>
              </div>
            ` : ""}
          </li>
        `;
      }).join("")
    : '<li class="sidebar-view-snippet-item">No exact snippet text was captured.</li>';

  return `
    <article class="viewer-evidence-card sidebar-view-snippet-card">
      <div class="viewer-evidence-card__header">
        <div>
          <h4 class="viewer-evidence-card__title">
            ${item.pubmed_url
              ? `<a href="${escapeHtml(item.pubmed_url)}" target="_blank" rel="noreferrer">${escapeHtml(item.title || "Related article")}</a>`
              : escapeHtml(item.title || "Related article")}
          </h4>
          <div class="sidebar-view-snippet-card__meta-row">
            <span class="viewer-evidence-card__meta">${escapeHtml(metaParts.join(" - "))}</span>
          </div>
        </div>
      </div>
      <ol class="sidebar-view-snippet-list">
        ${snippetHtml}
      </ol>
    </article>
  `;
}

function renderEvidenceList(statement, bucket) {
  const items = (statement.evidence || []).filter((item) => item.bucket === bucket);
  const bucketLabel = bucket === "contradict" ? "concerns" : bucket;
  if (!items.length) {
    return `<div class="viewer-empty-state">No ${bucketLabel} evidence in this scored output.</div>`;
  }
  const renderer = hasSnippetEvidence(statement) ? renderSnippetEvidenceCard : renderEvidenceCard;
  return `
    <div class="viewer-card-list sidebar-view-evidence-list">
      ${items.map((item) => renderer(item)).join("")}
    </div>
  `;
}

function renderFilters(statement) {
  const filterRow = document.getElementById("sidebarFilterRow");
  const supportCount = (statement.evidence || []).filter((item) => item.bucket === "support").length;
  const contradictCount = (statement.evidence || []).filter((item) => item.bucket === "contradict").length;
  const visibleTotal = supportCount + contradictCount;
  const options = [
    { key: "all", label: `All (${visibleTotal})` },
    { key: "support", label: `Support (${supportCount})` },
    { key: "contradict", label: `Concerns (${contradictCount})` },
  ];

  filterRow.innerHTML = "";
  for (const option of options) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "viewer-filter-chip";
    if (state.filter === option.key) {
      button.classList.add("is-active");
    }
    button.textContent = option.label;
    button.addEventListener("click", () => {
      clearActiveAnchorHighlight();
      state.filter = option.key;
      renderEvidenceOverlay();
    });
    filterRow.appendChild(button);
  }
}

function renderStatementSummary(statement) {
  if (hasSnippetEvidence(statement)) {
    return "";
  }
  const summary = statement.summary;
  if (!summary) {
    return '<p class="glp1-related-empty">No summary file entry was found for this statement.</p>';
  }
  return `
    <div class="sidebar-view-summary-block">
      <section class="viewer-statement-summary__section">
        <h3>Support summary${summary.support_score !== undefined && summary.support_score !== null ? ` - score ${escapeHtml(String(summary.support_score))}` : ""}</h3>
        <p>${escapeHtml(summary.support_summary || "No support summary available.")}</p>
      </section>
      <section class="viewer-statement-summary__section">
        <h3>Concerns summary${summary.contradict_score !== undefined && summary.contradict_score !== null ? ` - score ${escapeHtml(String(summary.contradict_score))}` : ""}</h3>
        <p>${escapeHtml(summary.contradict_summary || "No concerns summary available.")}</p>
      </section>
      <section class="viewer-statement-summary__section">
        <h3>Conclusion</h3>
        <p>${escapeHtml(summary.conclusion || "No conclusion available.")}</p>
      </section>
    </div>
  `;
}

function renderSidebar() {
  const source = getCurrentSource();
  const container = document.getElementById("sidebarStatementList");
  const sidebarSummary = document.getElementById("sidebarViewSummary");
  const statements = source?.statements || [];
  const filteredIndexes = normalizeStatementIndexes(state.sidebarStatementFilterIndexes || [], statements);
  const filteredIndexSet = new Set(filteredIndexes);
  const visibleEntries = filteredIndexes.length
    ? statements
        .map((statement, index) => ({ statement, index }))
        .filter((entry) => filteredIndexSet.has(entry.index))
    : statements.map((statement, index) => ({ statement, index }));
  const maxEvidenceTotal = getMaxStatementEvidenceTotal(statements);
  const clearFilterButton = filteredIndexes.length
    ? '<button class="sidebar-view-clear-filter" type="button" id="clearSidebarStatementFilter">Show all statements</button>'
    : "";
  sidebarSummary.innerHTML = filteredIndexes.length
    ? `${visibleEntries.length} of ${statements.length} statement${statements.length === 1 ? "" : "s"} shown for the selected text anchor. ${clearFilterButton}`
    : `${statements.length} statement${statements.length === 1 ? "" : "s"} for this source.`;

  document.getElementById("clearSidebarStatementFilter")?.addEventListener("click", clearSidebarStatementFilter);

  container.innerHTML = visibleEntries.map(({ statement, index }) => {
    const active = state.evidenceOverlayOpen && index === state.statementIndex;
    const total = statement.counts?.total || 0;
    return `
      <article class="glp1-statement-card ${active ? "is-active" : ""}" id="statement-card-${index}">
        <button class="glp1-statement-card__button" type="button" data-statement-index="${index}">
          <span class="glp1-statement-card__meta">
            <span>Statement ${statement.idx + 1}</span>
            <span class="glp1-map-pill">${total} articles</span>
          </span>
          <span class="glp1-statement-card__text">${escapeHtml(statement.text)}</span>
          ${renderDistributionBar(statement, maxEvidenceTotal)}
        </button>
      </article>
    `;
  }).join("");

  for (const button of container.querySelectorAll("[data-statement-index]")) {
    button.addEventListener("click", () => {
      state.activeAnchorStatementIndexes = null;
      state.statementIndex = Number(button.dataset.statementIndex);
      state.filter = "all";
      render();
      openEvidenceOverlay();
    });
    button.addEventListener("mouseenter", () => {
      state.hoveredStatementIndex = Number(button.dataset.statementIndex);
      updateAnchorHoverState();
    });
    button.addEventListener("mouseleave", () => {
      state.hoveredStatementIndex = null;
      updateAnchorHoverState();
    });
    button.addEventListener("focus", () => {
      state.hoveredStatementIndex = Number(button.dataset.statementIndex);
      updateAnchorHoverState();
    });
    button.addEventListener("blur", () => {
      state.hoveredStatementIndex = null;
      updateAnchorHoverState();
    });
  }
  updateAnchorHoverState();
}

function closeEvidenceOverlay(renderAfterClose = true) {
  const overlay = document.getElementById("sidebarStatementEvidenceOverlay");
  if (!overlay) {
    return;
  }
  overlay.hidden = true;
  overlay.setAttribute("aria-hidden", "true");
  document.body.classList.remove("viewer-dialog-open");
  state.evidenceOverlayOpen = false;
  if (renderAfterClose) {
    state.activeAnchorStatementIndexes = null;
    render();
  } else {
    updateAnchorActiveState();
  }
}

function openEvidenceOverlay() {
  const statement = getCurrentStatement();
  if (!statement) {
    return;
  }
  const overlay = document.getElementById("sidebarStatementEvidenceOverlay");
  if (!overlay) {
    return;
  }
  state.evidenceOverlayOpen = true;
  overlay.hidden = false;
  overlay.setAttribute("aria-hidden", "false");
  document.body.classList.add("viewer-dialog-open");
  render();
  renderEvidenceOverlay();
  document.getElementById("closeSidebarStatementEvidenceAction")?.focus();
}

function renderEvidenceOverlay() {
  const statement = getCurrentStatement();
  const title = document.getElementById("sidebarEvidenceTitle");
  const subtitle = document.getElementById("sidebarEvidenceSubtitle");
  const summary = document.getElementById("sidebarEvidenceSummary");
  const supportList = document.getElementById("sidebarSupportEvidenceList");
  const contradictList = document.getElementById("sidebarContradictEvidenceList");
  const filterRow = document.getElementById("sidebarFilterRow");
  const filterToolbar = document.querySelector(".sidebar-view-evidence-toolbar");
  const supportSection = document.getElementById("sidebarSupportSection");
  const contradictSection = document.getElementById("sidebarContradictSection");
  const supportTitle = document.getElementById("sidebarSupportTitle");
  const contradictTitle = document.getElementById("sidebarContradictTitle");
  const dialog = document.querySelector(".sidebar-view-dialog");

  if (!statement) {
    dialog?.classList.toggle("sidebar-view-dialog--snippets", false);
    title.textContent = "Support/Concerns related studies";
    subtitle.textContent = "Choose a statement to inspect its related studies.";
    subtitle.hidden = false;
    summary.innerHTML = "";
    filterRow.innerHTML = "";
    if (filterToolbar) {
      filterToolbar.hidden = false;
    }
    supportTitle.textContent = "Support";
    contradictTitle.textContent = "Concerns";
    supportSection.hidden = false;
    contradictSection.hidden = false;
    supportList.innerHTML = '<div class="viewer-empty-state">No support evidence available.</div>';
    contradictList.innerHTML = '<div class="viewer-empty-state">No concerns evidence available.</div>';
    return;
  }

  const supportCount = statement.counts?.support || 0;
  const contradictCount = statement.counts?.contradict || 0;
  const snippetMode = hasSnippetEvidence(statement);
  dialog?.classList.toggle("sidebar-view-dialog--snippets", snippetMode);
  title.textContent = statement.text;
  subtitle.textContent = `Statement ${statement.idx + 1} - ${supportCount} support / ${contradictCount} concerns related studies`;
  subtitle.hidden = snippetMode;
  supportTitle.textContent = `Studies with similar results (${supportCount})`;
  contradictTitle.textContent = `Studies with different results (${contradictCount})`;
  summary.innerHTML = renderStatementSummary(statement);
  if (snippetMode) {
    filterRow.innerHTML = "";
    if (filterToolbar) {
      filterToolbar.hidden = true;
    }
    supportSection.hidden = false;
    contradictSection.hidden = false;
  } else {
    if (filterToolbar) {
      filterToolbar.hidden = false;
    }
    renderFilters(statement);
    supportSection.hidden = state.filter === "contradict";
    contradictSection.hidden = state.filter === "support";
  }
  supportList.innerHTML = renderEvidenceList(statement, "support");
  contradictList.innerHTML = renderEvidenceList(statement, "contradict");
}

function bindEvidenceOverlay() {
  const overlay = document.getElementById("sidebarStatementEvidenceOverlay");
  const closeButton = document.getElementById("closeSidebarStatementEvidenceAction");

  closeButton?.addEventListener("click", () => closeEvidenceOverlay());
  overlay?.addEventListener("click", (event) => {
    if (event.target === overlay) {
      closeEvidenceOverlay();
    }
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && state.evidenceOverlayOpen) {
      closeEvidenceOverlay();
    }
  });
}

function chooseInitialSource() {
  const requestedPmid = getQueryParam("pmid");
  if (!requestedPmid) {
    state.sourceIndex = 0;
    return;
  }
  const index = (state.data.sources || []).findIndex((source) => source.pmid === requestedPmid);
  state.sourceIndex = index >= 0 ? index : 0;
}

function render() {
  renderPageTabs();
  renderHeader();
  renderSourceText();
  renderSidebar();
}

async function init() {
  state.dataPath = normalizeDataPath(getQueryParam("data"));
  const dataset = getDatasetOption();
  state.data = await loadJson(state.dataPath);

  if (dataset?.summaryFile) {
    const summaryRows = await loadJsonl(dataset.summaryFile);
    state.summariesByKey = Object.fromEntries(
      summaryRows.map((row) => [summaryKey(String(row.source_pmid || ""), Number(row.statement_idx)), row])
    );
    attachSummaries();
  }
  applySidebarSourceOverride();

  chooseInitialSource();
  state.statementIndex = null;
  renderDatasetPicker();
  renderSourcePicker();
  bindEvidenceOverlay();
  render();
}

init().catch((error) => {
  document.getElementById("sidebar-view-main").innerHTML = `<div class="viewer-empty-state">${escapeHtml(error.message)}</div>`;
});

const DATASET_OPTIONS = [
  { file: "./viewer_data.json", label: "Retracted articles" },
  { file: "./viewer_data_amd.json", label: "AMD cases" },
  { file: "./viewer_data_oph.json", label: "Ophthalmology cases" },
  { file: "./viewer_data_oph1.json", label: "oph1" },
  { file: "./viewer_data_retracted_rand_matches.json", label: "retracted_rand_matches" },
  { file: "./viewer_data_retracted_rand.json", label: "retracted_rand" },
  { file: "./viewer_data_retracted_rand_litsense.json", label: "retracted_rand_litsense" },
  { file: "./viewer_data_cochrane.json", label: "cochrane" },
  { file: "./viewer_data_cochrane_litsense.json", label: "cochrane_litsense" },
];
const VIEWER_CACHE_VERSION = "20260421b";

const state = {
  data: null,
  dataPath: "./viewer_data.json",
  metric: "avg",
};

function getQueryParam(name) {
  return new URLSearchParams(window.location.search).get(name);
}

function normalizeDataPath(dataPath) {
  if (!dataPath) {
    return "./viewer_data.json";
  }
  return dataPath.startsWith("./") ? dataPath : `./${dataPath}`;
}

function normalizeMetric(value) {
  return value === "max" ? "max" : "avg";
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

function buildPageUrl(pagePath, extraParams = {}) {
  const url = new URL(pagePath, window.location.href);
  url.searchParams.set("data", state.dataPath.replace("./", ""));
  url.searchParams.set("metric", state.metric);

  for (const [key, value] of Object.entries(extraParams)) {
    if (value === null || value === undefined || value === "") {
      url.searchParams.delete(key);
    } else {
      url.searchParams.set(key, String(value));
    }
  }

  return url.toString();
}

function formatPercent(value) {
  if (!Number.isFinite(value)) {
    return "NA";
  }
  return `${Math.round(value * 100)}%`;
}

function computeStatementNegProp(statement) {
  const total = Number(statement?.counts?.total || 0);
  const contradict = Number(statement?.counts?.contradict || 0);
  if (!Number.isFinite(total) || total <= 0) {
    return null;
  }
  return contradict / total;
}

function getRankedArticles() {
  const records = [];

  for (const source of state.data?.sources || []) {
    const statementProps = (source.statements || [])
      .map((statement) => {
        const negProp = computeStatementNegProp(statement);
        return negProp === null
          ? null
          : {
              statement,
              negProp,
            };
      })
      .filter(Boolean);

    if (!statementProps.length) {
      continue;
    }

    const avgProp =
      statementProps.reduce((sum, item) => sum + item.negProp, 0) / statementProps.length;
    const maxItem = statementProps.reduce((best, item) => {
      if (!best || item.negProp > best.negProp) {
        return item;
      }
      if (item.negProp === best.negProp) {
        const itemTotal = Number(item.statement?.counts?.total || 0);
        const bestTotal = Number(best.statement?.counts?.total || 0);
        if (itemTotal > bestTotal) {
          return item;
        }
      }
      return best;
    }, null);
    const totalEvidenceCount = statementProps.reduce(
      (sum, item) => sum + Number(item.statement?.counts?.total || 0),
      0
    );

    records.push({
      source,
      avgProp,
      maxProp: maxItem?.negProp ?? 0,
      totalEvidenceCount,
      rankedStatementCount: statementProps.length,
      maxStatement: maxItem?.statement || null,
    });
  }

  records.sort((a, b) => {
    const primaryDiff =
      state.metric === "max" ? b.maxProp - a.maxProp : b.avgProp - a.avgProp;
    if (primaryDiff !== 0) {
      return primaryDiff;
    }
    if (b.totalEvidenceCount !== a.totalEvidenceCount) {
      return b.totalEvidenceCount - a.totalEvidenceCount;
    }
    if (b.maxProp !== a.maxProp) {
      return b.maxProp - a.maxProp;
    }
    if (b.avgProp !== a.avgProp) {
      return b.avgProp - a.avgProp;
    }
    return String(a.source.pmid).localeCompare(String(b.source.pmid));
  });

  return records;
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
    window.location.href = buildPageUrl("./article_ranking.html");
  });
}

function renderMetricControl() {
  const select = document.getElementById("metricSelect");
  if (!select.dataset.bound) {
    select.addEventListener("change", (event) => {
      state.metric = normalizeMetric(event.target.value);
      setQueryParam("metric", state.metric);
      renderPageTabs();
      renderArticleRanking();
    });
    select.dataset.bound = "true";
  }
  select.value = state.metric;
}

function renderPageTabs() {
  const articleViewTabLink = document.getElementById("articleViewTabLink");
  const statementRankingLink = document.getElementById("statementRankingLink");
  const articleRankingLink = document.getElementById("articleRankingLink");

  articleViewTabLink.href = buildPageUrl("./index.html");
  statementRankingLink.href = buildPageUrl("./statement_ranking.html");
  articleRankingLink.href = buildPageUrl("./article_ranking.html");
}

function renderArticleRanking() {
  const summary = document.getElementById("articleRankingSummary");
  const container = document.getElementById("articleRankingList");
  const template = document.getElementById("articleRankingTemplate");
  container.innerHTML = "";

  const ranked = getRankedArticles();
  if (!ranked.length) {
    summary.textContent = "No articles have statements with non-zero support/contradict evidence in this dataset.";
    container.innerHTML = '<div class="viewer-empty-state">No article rankings are available for this dataset.</div>';
    return;
  }

  summary.textContent =
    state.metric === "max"
      ? `${ranked.length} articles ranked by the maximum contradiction proportion reached by any statement.`
      : `${ranked.length} articles ranked by the average contradiction proportion across their statements.`;

  ranked.forEach((record, index) => {
    const fragment = template.content.cloneNode(true);
    const card = fragment.querySelector(".viewer-article-ranking-card");
    const metricValue = state.metric === "max" ? record.maxProp : record.avgProp;

    fragment.querySelector(".viewer-statement-card__index").textContent = `Rank ${index + 1}`;
    fragment.querySelector(".viewer-statement-card__totals").textContent =
      `${state.metric === "max" ? "Maximum statement score" : "Average across statements"} ${formatPercent(metricValue)}`;
    fragment.querySelector(".viewer-ranking-card__source").innerHTML =
      `<strong>Source PMID ${escapeHtml(record.source.pmid)}</strong> • ${escapeHtml(record.source.title)}`;

    const metrics = fragment.querySelector(".viewer-article-ranking-card__metrics");
    [
      `Average across statements ${formatPercent(record.avgProp)}`,
      `Maximum statement score ${formatPercent(record.maxProp)}`,
      `${record.rankedStatementCount} ranked statement${record.rankedStatementCount === 1 ? "" : "s"}`,
    ].forEach((label) => {
      const chip = document.createElement("span");
      chip.className = "viewer-article-ranking-chip";
      chip.textContent = label;
      metrics.appendChild(chip);
    });

    fragment.querySelector(".viewer-article-ranking-card__excerpt").textContent =
      record.maxStatement?.text || "No contradicted statement text available.";

    card.addEventListener("click", () => {
      window.location.href = buildPageUrl("./index.html", { pmid: record.source.pmid });
    });

    container.appendChild(fragment);
  });
}

async function init() {
  state.dataPath = normalizeDataPath(getQueryParam("data") || "./viewer_data.json");
  state.metric = normalizeMetric(getQueryParam("metric"));

  state.data = await loadJsonWithSessionCache(state.dataPath);
  state.data.sources = [...(state.data.sources || [])].sort((a, b) =>
    comparePmidsAscending(a?.pmid, b?.pmid)
  );
  if (!state.data.sources?.length) {
    throw new Error("Viewer dataset contains no source articles.");
  }

  renderDatasetPicker();
  renderMetricControl();
  renderPageTabs();
  renderArticleRanking();
}

init().catch((error) => {
  const main = document.getElementById("article-ranking-main");
  main.innerHTML = `<div class="viewer-empty-state">${escapeHtml(error.message)}</div>`;
});

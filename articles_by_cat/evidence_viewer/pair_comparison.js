const DATA_PATH = "./pair_comparison_retracted_rand.json";
const VIEWER_CACHE_VERSION = "20260406b";

function escapeHtml(text) {
  return String(text ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatScore(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? String(value) : "NA";
}

function formatDerivedScore(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric.toFixed(3) : "NA";
}

function formatProportion(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric.toFixed(3) : "NA";
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

function createStatementCard(statement) {
  const article = document.createElement("article");
  article.className = "viewer-compare-statement";

  const countsText = `${statement.support_count || 0} support • ${statement.contradict_count || 0} contradict`;
  const hasSummaryContent = Boolean(
    statement.support_summary ||
      statement.contradict_summary ||
      statement.conclusion ||
      statement.support_score !== null ||
      statement.support_score !== undefined ||
      statement.contradict_score !== null ||
      statement.contradict_score !== undefined
  );

  article.innerHTML = `
    <div class="viewer-compare-statement__header">
      <span class="viewer-compare-statement__index">Statement ${statement.idx + 1}</span>
      <span class="viewer-compare-statement__counts">${escapeHtml(countsText)}</span>
    </div>
    <p class="viewer-compare-statement__text">${escapeHtml(statement.text || "No statement text available.")}</p>
    ${
      hasSummaryContent
        ? `
          <div class="viewer-compare-statement__scores">
            <span class="viewer-article-ranking-chip">Support score ${escapeHtml(formatScore(statement.support_score))}</span>
            <span class="viewer-article-ranking-chip">Contradict score ${escapeHtml(formatScore(statement.contradict_score))}</span>
            <span class="viewer-article-ranking-chip">Controversy ${escapeHtml(formatDerivedScore(statement.controversy_score))}</span>
            <span class="viewer-article-ranking-chip">Directional ${escapeHtml(formatDerivedScore(statement.directional_score))}</span>
          </div>
          <div class="viewer-statement-summary viewer-compare-statement__summary">
            <div class="viewer-statement-summary__content">
              <div class="viewer-statement-summary__section">
                <h4>Support summary</h4>
                <p>${escapeHtml(statement.support_summary || "No support summary available.")}</p>
              </div>
              <div class="viewer-statement-summary__section">
                <h4>Contradict summary</h4>
                <p>${escapeHtml(statement.contradict_summary || "No contradict summary available.")}</p>
              </div>
              <div class="viewer-statement-summary__section">
                <h4>Conclusion</h4>
                <p>${escapeHtml(statement.conclusion || "No conclusion available.")}</p>
              </div>
            </div>
          </div>
        `
        : '<p class="viewer-empty-state viewer-compare-empty">No summaries or scores are available for this statement yet.</p>'
    }
  `;

  return article;
}

function createArticleDetails(article, label) {
  const details = document.createElement("details");
  details.className = "viewer-compare-article";

  if (!article) {
    details.open = false;
    details.innerHTML = `
      <summary>
        <span class="viewer-compare-article__label">${escapeHtml(label)}</span>
        <span class="viewer-compare-article__title">No paired article available.</span>
      </summary>
      <div class="viewer-empty-state">This side of the pair is empty.</div>
    `;
    return details;
  }

  const statements = article.statements || [];
  const metrics = article.metrics || {};
  const statementsHost = document.createElement("div");
  statementsHost.className = "viewer-compare-statements";

  if (!statements.length) {
    statementsHost.innerHTML = '<div class="viewer-empty-state">No extracted statements are available for this article.</div>';
  } else {
    statements.forEach((statement) => {
      statementsHost.appendChild(createStatementCard(statement));
    });
  }

  details.innerHTML = `
    <summary>
      <span class="viewer-compare-article__label">${escapeHtml(label)}</span>
      <span class="viewer-compare-article__title">${escapeHtml(article.title || "Untitled article")}</span>
      <span class="viewer-compare-article__meta">PMID ${escapeHtml(article.pmid)} • ${statements.length} statement${statements.length === 1 ? "" : "s"}</span>
      <div class="viewer-compare-article__scores">
        <span class="viewer-article-ranking-chip">Average ${escapeHtml(formatProportion(metrics.avg_contradiction_prop))}</span>
        <span class="viewer-article-ranking-chip">Maximum ${escapeHtml(formatProportion(metrics.max_contradiction_prop))}</span>
        <span class="viewer-article-ranking-chip">Total articles ${escapeHtml(String(metrics.total_evidence_count ?? 0))}</span>
        <span class="viewer-article-ranking-chip">Top controversy ${escapeHtml(formatDerivedScore(metrics.top_statement_controversy_score))}</span>
        <span class="viewer-article-ranking-chip">Top directional ${escapeHtml(formatDerivedScore(metrics.top_statement_directional_score))}</span>
      </div>
    </summary>
    <div class="viewer-compare-article__body">
      <p class="viewer-compare-article__links">
        <a href="${escapeHtml(article.pubmed_url)}" target="_blank" rel="noreferrer">Open on PubMed</a>
      </p>
    </div>
  `;
  details.querySelector(".viewer-compare-article__body").appendChild(statementsHost);

  return details;
}

function renderPairs(payload) {
  const summary = document.getElementById("pairComparisonSummary");
  const container = document.getElementById("pairComparisonList");
  container.innerHTML = "";

  const pairs = [...(payload?.pairs || [])].sort((a, b) =>
    comparePmidsAscending(a?.source_pmid, b?.source_pmid)
  );
  if (!pairs.length) {
    summary.textContent = "No matched comparison pairs are available.";
    container.innerHTML = '<div class="viewer-empty-state">No matched pairs could be loaded.</div>';
    return;
  }

  summary.textContent = `${pairs.length} matched article pairs are available for side-by-side comparison.`;

  pairs.forEach((pair, index) => {
    const section = document.createElement("section");
    section.className = "viewer-compare-pair";
    section.innerHTML = `
      <div class="viewer-compare-pair__header">
        <span class="viewer-statement-card__index">Pair ${index + 1}</span>
        <span class="viewer-statement-card__totals">Source PMID ${escapeHtml(pair.source_pmid)}${pair.matched_pmid ? ` • Match PMID ${escapeHtml(pair.matched_pmid)}` : ""}</span>
      </div>
      <div class="viewer-compare-grid"></div>
    `;

    const grid = section.querySelector(".viewer-compare-grid");
    const sourceDetails = createArticleDetails(pair.source_article, "Retracted article");
    const matchedDetails = createArticleDetails(pair.matched_article, "Matched article");

    const togglePair = (nextOpen) => {
      sourceDetails.open = nextOpen;
      matchedDetails.open = nextOpen;
    };

    const handlePairToggleClick = (event) => {
      if (event.target.closest("a, button, input, select, textarea")) {
        return;
      }
      if (window.getSelection && String(window.getSelection()).trim()) {
        return;
      }
      event.preventDefault();
      togglePair(!(sourceDetails.open && matchedDetails.open));
    };

    sourceDetails.addEventListener("click", handlePairToggleClick);
    matchedDetails.addEventListener("click", handlePairToggleClick);

    grid.appendChild(sourceDetails);
    grid.appendChild(matchedDetails);
    container.appendChild(section);
  });
}

async function init() {
  renderPairs(await loadJsonWithSessionCache(DATA_PATH));
}

init().catch((error) => {
  const main = document.getElementById("pair-comparison-main");
  main.innerHTML = `<div class="viewer-empty-state">${escapeHtml(error.message)}</div>`;
});

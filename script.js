
// =======================
// EU Digital Exclusion Map
// =======================

const metricSelect = d3.select("#metric");
const tooltip = d3.select("#tooltip");

const METRICS = {
  derviw: { label: "DERVIW (Risk Index)" },
  idfdv:  { label: "IDFDV (Inclusion Index)" },
  wass:   { label: "WASS (Web Accessibility Severity)" }
};

let selectedMetric = metricSelect.node().value;

let data = [];
let byIso2 = new Map();

let mapSvg, mapG, mapPath, mapColor;

// ---------- Formatting helpers ----------
function fmt(x, digits = 3) {
  const v = +x;
  if (Number.isNaN(v) || x === null || x === undefined) return "NA";
  return v.toFixed(digits);
}

function fmtInt(x) {
  const v = +x;
  if (Number.isNaN(v) || x === null || x === undefined) return "NA";
  return d3.format(",")(v);
}

// Tooltip
function showTooltip(event, d) {
  const html = `
    <div><strong>${d.country_name} (${d.iso2})</strong></div>
    <div>${METRICS[selectedMetric].label}: <strong>${fmt(d[selectedMetric])}</strong></div>
    <div>WASS: ${fmt(d.wass)} · Digital context: ${fmt(d.digital_context)}</div>
    <div>Female VI (abs): ${fmtInt(d.visual_impairment_female)}</div>
  `;

  tooltip
    .style("opacity", 1)
    .html(html)
    .style("left", (event.clientX + 14) + "px")
    .style("top", (event.clientY + 14) + "px");
}

function hideTooltip() {
  tooltip.style("opacity", 0);
}

// ---------- Load data ----------
Promise.all([
  d3.csv("data/country_metrics_public.csv", d3.autoType),
  d3.json("https://raw.githubusercontent.com/leakyMirror/map-of-europe/master/GeoJSON/europe.geojson")
]).then(([csv, geo]) => {
  data = csv;

  // Create quick lookup: iso2 -> row
  byIso2 = new Map(data.map(d => [d.iso2, d]));

  // Build map once
  initMap(geo);

  // First render
  renderMap();

  // On metric change -> recolor
  metricSelect.on("change", () => {
    selectedMetric = metricSelect.node().value;
    renderMap();
  });
}).catch(err => {
  console.error("Error loading files:", err);
});

// ---------- Map init ----------
function initMap(geo) {
  // Responsive SVG via viewBox
  const w = 980;
  const h = 520;

  mapSvg = d3.select("#map")
    .append("svg")
    .attr("viewBox", `0 0 ${w} ${h}`)
    .attr("width", "100%")
    .attr("height", "100%");

  const projection = d3.geoMercator()
    .fitSize([w, h], geo);

  mapPath = d3.geoPath(projection);

  mapG = mapSvg.append("g");

  // Draw all European shapes; color only those in our dataset
  mapG.selectAll("path")
    .data(geo.features)
    .enter()
    .append("path")
    .attr("class", "country")
    .attr("d", mapPath)
    .attr("stroke", "rgba(255,255,255,0.18)")
    .attr("stroke-width", 1)
    .attr("fill", d => {
      const iso2 = d.properties.ISO2;
      return byIso2.has(iso2) ? "#2b3a55" : "rgba(255,255,255,0.04)";
    })
    .on("mousemove", (event, d) => {
      const iso2 = d.properties.ISO2;
      if (!byIso2.has(iso2)) return;
      const row = byIso2.get(iso2);
      showTooltip(event, row);
    })
    .on("mouseleave", () => {
      hideTooltip();
    });

  // Optional: zoom/pan disabled for simplicity (you can add later)
}

// ---------- Map render ----------
function renderMap() {
  // Compute domain from EU data only
  const values = data
    .map(d => d[selectedMetric])
    .filter(v => v !== null && v !== undefined && !Number.isNaN(v));

  const [minV, maxV] = d3.extent(values);

  // Color scale
  mapColor = d3.scaleSequential()
    .domain([minV, maxV])
    .interpolator(d3.interpolateTurbo);

  // Apply fill
  mapG.selectAll("path.country")
    .transition()
    .duration(450)
    .attr("fill", d => {
      const iso2 = d.properties.ISO2;
      if (!byIso2.has(iso2)) return "rgba(255,255,255,0.04)";
      const v = byIso2.get(iso2)[selectedMetric];
      if (v === null || v === undefined || Number.isNaN(v)) return "#2b3a55";
      return mapColor(v);
    });
}

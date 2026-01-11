const metricSelect = d3.select("#metric");
const tooltip = d3.select("#tooltip");
const kpisContainer = d3.select("#kpis");
const metricHelp = d3.select("#metricHelp");
const legendText = d3.select("#legendText");
const clearBtn = d3.select("#clearSelection");

const METRICS = {
  derviw: {
    label: "DERVIW · Índice de riesgo",
    direction: "higher_worse",
    help:
      "Cómo interpretarlo: valores más altos indican mayor riesgo compuesto. " +
      "En términos prácticos, se asocian a más barreras web, menor contexto digital y mayor carga femenina relativa."
  },
  idfdv: {
    label: "IDFDV · Índice de inclusión",
    direction: "higher_better",
    help:
      "Cómo interpretarlo: valores más altos indican mejores condiciones de inclusión. " +
      "Combina accesibilidad web y contexto digital, ajustado por necesidad (carga femenina de pérdida de visión)."
  },
  wass: {
    label: "WASS · Severidad de barreras web",
    direction: "higher_worse",
    help:
      "Cómo interpretarlo: valores más altos reflejan mayor severidad de barreras de accesibilidad web " +
      "(peor experiencia, más errores y problemas de contraste)."
  }
};

let selectedMetric = metricSelect.node().value;

let data = [];
let byIso2 = new Map();
let activeIso2 = null;
let pinnedIso2 = null;

let mapSvg, mapG, mapPath, mapColor;

// ---------- Helpers ----------
const fmt = (x, digits=3) => {
  const v = +x;
  if (Number.isNaN(v) || x === null || x === undefined) return "NA";
  return v.toFixed(digits);
};

const fmtInt = (x) => {
  const v = +x;
  if (Number.isNaN(v) || x === null || x === undefined) return "NA";
  return d3.format(",")(v);
};

function countryLabel(d){
  const name = d.country_name ?? d.country ?? null;
  return name ? `${name} (${d.iso2})` : `${d.iso2}`;
}

function isValidNumber(x){
  return x !== null && x !== undefined && !Number.isNaN(+x);
}

// ---------- Tooltip ----------
function tooltipHtml(d){
  const ratio = (isValidNumber(d.visual_impairment_male) && +d.visual_impairment_male > 0)
    ? (+d.visual_impairment_female / +d.visual_impairment_male)
    : null;

  const female = isValidNumber(d.visual_impairment_female) ? fmtInt(d.visual_impairment_female) : "NA";
  const male   = isValidNumber(d.visual_impairment_male) ? fmtInt(d.visual_impairment_male) : "NA";

  return `
    <div><strong>${countryLabel(d)}</strong></div>
    <div>${METRICS[selectedMetric].label}: <strong>${fmt(d[selectedMetric])}</strong></div>
    <div>WASS: ${fmt(d.wass)} · Contexto digital: ${fmt(d.digital_context)}</div>
    <div>Pérdida de visión (mujeres): ${female}</div>
    <div>Pérdida de visión (hombres): ${male}</div>
    <div>Proporción mujeres/hombres: <strong>${ratio ? ratio.toFixed(2) : "NA"}</strong></div>
    <div style="margin-top:6px; color: rgba(255,255,255,0.70); font-size:12px;">
      ${pinnedIso2 ? "Selección fijada (clic para soltar)." : "Clic para fijar este país."}
    </div>
  `;
}

function showTooltip(event, d){
  tooltip
    .style("opacity", 1)
    .html(tooltipHtml(d))
    .style("left", (event.clientX + 14) + "px")
    .style("top", (event.clientY + 14) + "px");
}

function hideTooltip(){
  if (pinnedIso2) return;
  tooltip.style("opacity", 0);
}

// ---------- Cross highlight ----------
function setActive(iso2){
  activeIso2 = iso2;

  d3.selectAll(".country").classed("active", d => d.properties.ISO2 === activeIso2);
  d3.selectAll(".bar").classed("active", d => d.iso2 === activeIso2);
  d3.selectAll(".dot").classed("active", d => d.iso2 === activeIso2);
  d3.selectAll(".genderbar").classed("active", d => d.iso2 === activeIso2);
}

function pinCountry(iso2){
  pinnedIso2 = iso2;
}

function clearPin(){
  pinnedIso2 = null;
  tooltip.style("opacity", 0);
  setActive(null);
}

// ---------- Load ----------
Promise.all([
  d3.csv("data/country_metrics_public.csv", d3.autoType),
  d3.json("https://raw.githubusercontent.com/leakyMirror/map-of-europe/master/GeoJSON/europe.geojson")
]).then(([csv, geo]) => {

  data = csv.map(d => ({
    ...d,
    female_male_ratio: (isValidNumber(d.visual_impairment_male) && +d.visual_impairment_male > 0)
      ? (+d.visual_impairment_female / +d.visual_impairment_male)
      : null
  }));

  byIso2 = new Map(data.map(d => [d.iso2, d]));

  initMap(geo);
  renderAll();

  metricSelect.on("change", () => {
    selectedMetric = metricSelect.node().value;
    renderAll();
    if (pinnedIso2 && byIso2.has(pinnedIso2)){
      tooltip.html(tooltipHtml(byIso2.get(pinnedIso2))).style("opacity", 1);
    }
  });

  clearBtn.on("click", () => clearPin());

}).catch(err => {
  console.error("Error cargando archivos:", err);
  metricHelp.text("Error cargando datos. Revisa que exista data/country_metrics_public.csv en el repositorio.");
});

// ---------- Textos ----------
function renderHelp(){
  metricHelp.text(METRICS[selectedMetric].help);

  const dir = METRICS[selectedMetric].direction;
  if (dir === "higher_better"){
    legendText.text("Leyenda: colores más intensos indican valores más altos (mejor situación relativa para esta métrica).");
  } else {
    legendText.text("Leyenda: colores más intensos indican valores más altos (peor situación relativa para esta métrica).");
  }
}

function renderKPIs(){
  kpisContainer.selectAll("*").remove();

  const sorted = [...data].sort((a,b) => d3.descending(a[selectedMetric], b[selectedMetric]));
  const top = sorted[0];
  const bottom = sorted[sorted.length - 1];

  const cards = [
    { label: "Métrica activa", value: METRICS[selectedMetric].label },
    { label: "Valor más alto", value: `${countryLabel(top)} · ${fmt(top[selectedMetric])}` },
    { label: "Valor más bajo", value: `${countryLabel(bottom)} · ${fmt(bottom[selectedMetric])}` },
  ];

  const kpi = kpisContainer.selectAll("div")
    .data(cards)
    .enter()
    .append("div")
    .attr("class","kpi");

  kpi.append("div").attr("class","label").text(d => d.label);
  kpi.append("div").attr("class","value").text(d => d.value);
}

// ---------- Map ----------
function initMap(geo){
  const w = 980, h = 520;

  d3.select("#map").selectAll("*").remove();

  mapSvg = d3.select("#map")
    .append("svg")
    .attr("viewBox", `0 0 ${w} ${h}`)
    .attr("width","100%")
    .attr("height","100%");

  const projection = d3.geoMercator().fitSize([w,h], geo);
  mapPath = d3.geoPath(projection);

  mapG = mapSvg.append("g");

  mapG.selectAll("path")
    .data(geo.features)
    .enter()
    .append("path")
    .attr("class","country")
    .attr("d", mapPath)
    .attr("stroke","rgba(255,255,255,0.18)")
    .attr("stroke-width",1)
    .attr("fill", d => byIso2.has(d.properties.ISO2) ? "#2b3a55" : "rgba(255,255,255,0.04)")
    .style("cursor", d => byIso2.has(d.properties.ISO2) ? "pointer" : "default")
    .on("mousemove", (event, d) => {
      const iso2 = d.properties.ISO2;
      if (!byIso2.has(iso2)) return;
      const row = byIso2.get(iso2);
      if (!pinnedIso2) showTooltip(event, row);
      setActive(pinnedIso2 ?? iso2);
    })
    .on("mouseleave", () => {
      hideTooltip();
      setActive(pinnedIso2);
    })
    .on("click", (event, d) => {
      const iso2 = d.properties.ISO2;
      if (!byIso2.has(iso2)) return;

      if (pinnedIso2 === iso2){
        clearPin();
      } else {
        pinCountry(iso2);
        setActive(iso2);
        showTooltip(event, byIso2.get(iso2));
      }
    });
}

function renderLegend(minV, maxV){
  const legend = d3.select("#legend");
  legend.selectAll("*").remove();

  legend.append("div").text(`Leyenda: ${METRICS[selectedMetric].label}`);

  const w = 260, h = 12;
  const canvas = legend.append("canvas")
    .attr("width", w)
    .attr("height", h)
    .style("border", "1px solid rgba(255,255,255,0.12)")
    .style("border-radius", "6px");

  const ctx = canvas.node().getContext("2d");
  for (let i=0; i<w; i++){
    const t = i/(w-1);
    ctx.fillStyle = mapColor(minV + t*(maxV-minV));
    ctx.fillRect(i, 0, 1, h);
  }

  legend.append("div").text(`mín: ${fmt(minV)} · máx: ${fmt(maxV)}`);
}

function colorizeMap(){
  const values = data.map(d => d[selectedMetric]).filter(v => isValidNumber(v));
  const [minV, maxV] = d3.extent(values);

  mapColor = d3.scaleSequential()
    .domain([minV, maxV])
    .interpolator(d3.interpolateTurbo);

  mapG.selectAll("path.country")
    .transition().duration(350)
    .attr("fill", d => {
      const iso2 = d.properties.ISO2;
      if (!byIso2.has(iso2)) return "rgba(255,255,255,0.04)";
      const v = byIso2.get(iso2)[selectedMetric];
      return isValidNumber(v) ? mapColor(v) : "#2b3a55";
    });

  renderLegend(minV, maxV);
}

// ---------- Ranking ----------
function renderRanking(){
  const container = d3.select("#ranking");
  container.selectAll("*").remove();

  const w = 980, h = 420;
  const margin = {top: 10, right: 20, bottom: 35, left: 75};

  const svg = container.append("svg").attr("viewBox", `0 0 ${w} ${h}`);

  const sorted = [...data].sort((a,b) => d3.descending(a[selectedMetric], b[selectedMetric]));

  const x = d3.scaleLinear()
    .domain([0, d3.max(sorted, d => +d[selectedMetric])]).nice()
    .range([margin.left, w - margin.right]);

  const y = d3.scaleBand()
    .domain(sorted.map(d => d.iso2))
    .range([margin.top, h - margin.bottom])
    .padding(0.15);

  svg.append("g")
    .attr("transform", `translate(0,${h - margin.bottom})`)
    .call(d3.axisBottom(x).ticks(6))
    .call(g => g.selectAll("text").attr("fill","rgba(255,255,255,0.8)"))
    .call(g => g.selectAll("path,line").attr("stroke","rgba(255,255,255,0.25)"));

  svg.append("g")
    .attr("transform", `translate(${margin.left},0)`)
    .call(d3.axisLeft(y))
    .call(g => g.selectAll("text").attr("fill","rgba(255,255,255,0.8)"))
    .call(g => g.selectAll("path,line").attr("stroke","rgba(255,255,255,0.25)"));

  const row = svg.append("g")
    .selectAll("g")
    .data(sorted)
    .enter()
    .append("g")
    .attr("class","bar")
    .style("cursor","pointer")
    .on("mousemove", (event, d) => {
      if (!pinnedIso2) showTooltip(event, d);
      setActive(pinnedIso2 ?? d.iso2);
    })
    .on("mouseleave", () => {
      hideTooltip();
      setActive(pinnedIso2);
    })
    .on("click", (event, d) => {
      if (pinnedIso2 === d.iso2){
        clearPin();
      } else {
        pinCountry(d.iso2);
        setActive(d.iso2);
        showTooltip(event, d);
      }
    });

  row.append("rect")
    .attr("x", x(0))
    .attr("y", d => y(d.iso2))
    .attr("width", d => x(+d[selectedMetric]) - x(0))
    .attr("height", y.bandwidth())
    .attr("fill", d => mapColor(d[selectedMetric]))
    .attr("stroke","rgba(255,255,255,0.10)");

  row.append("text")
    .attr("x", d => x(+d[selectedMetric]) + 6)
    .attr("y", d => y(d.iso2) + y.bandwidth()/2 + 4)
    .attr("fill","rgba(255,255,255,0.85)")
    .style("font-size","11px")
    .text(d => fmt(d[selectedMetric]));
}

// ---------- Scatter ----------
function renderScatter(){
  const container = d3.select("#scatter");
  container.selectAll("*").remove();

  const w = 980, h = 520;
  const margin = {top: 10, right: 20, bottom: 55, left: 80};

  const svg = container.append("svg").attr("viewBox", `0 0 ${w} ${h}`);

  const x = d3.scaleLinear()
    .domain(d3.extent(data, d => +d.wass)).nice()
    .range([margin.left, w - margin.right]);

  const y = d3.scaleLinear()
    .domain(d3.extent(data, d => +d.digital_context)).nice()
    .range([h - margin.bottom, margin.top]);

  const r = d3.scaleSqrt()
    .domain(d3.extent(data, d => +d.visual_impairment_female))
    .range([4, 18]);

  svg.append("g")
    .attr("transform", `translate(0,${h - margin.bottom})`)
    .call(d3.axisBottom(x).ticks(6))
    .call(g => g.selectAll("text").attr("fill","rgba(255,255,255,0.8)"))
    .call(g => g.selectAll("path,line").attr("stroke","rgba(255,255,255,0.25)"));

  svg.append("g")
    .attr("transform", `translate(${margin.left},0)`)
    .call(d3.axisLeft(y).ticks(6))
    .call(g => g.selectAll("text").attr("fill","rgba(255,255,255,0.8)"))
    .call(g => g.selectAll("path,line").attr("stroke","rgba(255,255,255,0.25)"));

  svg.append("text")
    .attr("x", w/2).attr("y", h - 18)
    .attr("text-anchor","middle")
    .attr("fill","rgba(255,255,255,0.75)")
    .style("font-size","12px")
    .text("WASS (más alto = más barreras web)");

  svg.append("text")
    .attr("transform","rotate(-90)")
    .attr("x", -h/2).attr("y", 22)
    .attr("text-anchor","middle")
    .attr("fill","rgba(255,255,255,0.75)")
    .style("font-size","12px")
    .text("Contexto digital (más alto = más capacidad)");

  svg.append("g")
    .selectAll("circle")
    .data(data)
    .enter()
    .append("circle")
    .attr("class","dot")
    .attr("cx", d => x(+d.wass))
    .attr("cy", d => y(+d.digital_context))
    .attr("r", d => r(+d.visual_impairment_female))
    .attr("fill", d => mapColor(d[selectedMetric]))
    .attr("fill-opacity", 0.85)
    .attr("stroke", "rgba(0,0,0,0.35)")
    .style("cursor","pointer")
    .on("mousemove", (event, d) => {
      if (!pinnedIso2) showTooltip(event, d);
      setActive(pinnedIso2 ?? d.iso2);
    })
    .on("mouseleave", () => {
      hideTooltip();
      setActive(pinnedIso2);
    })
    .on("click", (event, d) => {
      if (pinnedIso2 === d.iso2){
        clearPin();
      } else {
        pinCountry(d.iso2);
        setActive(d.iso2);
        showTooltip(event, d);
      }
    });
}

// ---------- Gender ratio ----------
function renderGender(){
  const container = d3.select("#gender");
  container.selectAll("*").remove();

  const w = 980, h = 420;
  const margin = {top: 10, right: 20, bottom: 35, left: 85};

  const sorted = [...data]
    .filter(d => isValidNumber(d.female_male_ratio))
    .sort((a,b) => d3.descending(+a.female_male_ratio, +b.female_male_ratio));

  const svg = container.append("svg").attr("viewBox", `0 0 ${w} ${h}`);

  const x = d3.scaleLinear()
    .domain(d3.extent(sorted, d => +d.female_male_ratio)).nice()
    .range([margin.left, w - margin.right]);

  const y = d3.scaleBand()
    .domain(sorted.map(d => d.iso2))
    .range([margin.top, h - margin.bottom])
    .padding(0.15);

  svg.append("g")
    .attr("transform", `translate(0,${h - margin.bottom})`)
    .call(d3.axisBottom(x).ticks(6))
    .call(g => g.selectAll("text").attr("fill","rgba(255,255,255,0.8)"))
    .call(g => g.selectAll("path,line").attr("stroke","rgba(255,255,255,0.25)"));

  svg.append("g")
    .attr("transform", `translate(${margin.left},0)`)
    .call(d3.axisLeft(y))
    .call(g => g.selectAll("text").attr("fill","rgba(255,255,255,0.8)"))
    .call(g => g.selectAll("path,line").attr("stroke","rgba(255,255,255,0.25)"));

  svg.append("line")
    .attr("x1", x(1.0)).attr("x2", x(1.0))
    .attr("y1", margin.top).attr("y2", h - margin.bottom)
    .attr("stroke", "rgba(255,255,255,0.25)")
    .attr("stroke-dasharray", "4,4");

  const row = svg.append("g")
    .selectAll("g")
    .data(sorted)
    .enter()
    .append("g")
    .attr("class","genderbar")
    .style("cursor","pointer")
    .on("mousemove", (event, d) => {
      if (!pinnedIso2) showTooltip(event, d);
      setActive(pinnedIso2 ?? d.iso2);
    })
    .on("mouseleave", () => {
      hideTooltip();
      setActive(pinnedIso2);
    })
    .on("click", (event, d) => {
      if (pinnedIso2 === d.iso2){
        clearPin();
      } else {
        pinCountry(d.iso2);
        setActive(d.iso2);
        showTooltip(event, d);
      }
    });

  row.append("rect")
    .attr("x", d => x(Math.min(1.0, +d.female_male_ratio)))
    .attr("y", d => y(d.iso2))
    .attr("width", d => Math.abs(x(+d.female_male_ratio) - x(1.0)))
    .attr("height", y.bandwidth())
    .attr("fill", "rgba(255,255,255,0.20)")
    .attr("stroke","rgba(255,255,255,0.10)");

  row.append("text")
    .attr("x", d => x(+d.female_male_ratio) + 6)
    .attr("y", d => y(d.iso2) + y.bandwidth()/2 + 4)
    .attr("fill","rgba(255,255,255,0.85)")
    .style("font-size","11px")
    .text(d => (+d.female_male_ratio).toFixed(2));
}

// ---------- Render master ----------
function renderAll(){
  renderHelp();
  renderKPIs();
  colorizeMap();
  renderRanking();
  renderScatter();
  renderGender();

  // Si hay pin, mantener resaltado
  if (pinnedIso2) setActive(pinnedIso2);
}

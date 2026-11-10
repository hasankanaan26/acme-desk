// kit.js — one slide spec, two outputs:
//   deck.savePptx(path)    -> the real deck, via pptxgenjs
//   deck.saveHtml(path)    -> a preview page for QA screenshots (Edge headless)
// Only a small set of primitives, so both backends agree:
//   text (paragraphs of runs), rect, roundRect, ellipse, line, image, notes.
// Units: inches. Font sizes: points. Text margins: points (pptxgenjs semantics).

const pptxgen = require("pptxgenjs");
const fs = require("fs");

const W = 10, H = 5.625, PX = 96;
const LINE = { Calibri: 1.22, Arial: 1.15, Consolas: 1.17 };

// Normalize text content into paragraphs: [{runs:[{text,...}], bullet, align, spaceAfter, spaceBefore}]
function paragraphs(content) {
  if (typeof content === "string") {
    return content.split("\n").map(line => ({ runs: [{ text: line }] }));
  }
  return content.map(p => {
    if (typeof p === "string") return { runs: [{ text: p }] };
    if (Array.isArray(p)) return { runs: p.map(r => (typeof r === "string" ? { text: r } : r)) };
    const runs = typeof p.runs === "string" ? [{ text: p.runs }] : p.runs.map(r => (typeof r === "string" ? { text: r } : r));
    return { ...p, runs };
  });
}

class Slide {
  constructor(opts) {
    this.bg = opts.bg || "FFFFFF";
    this.section = opts.section;
    this.els = [];
    this.notesText = "";
  }
  text(content, o) { this.els.push({ kind: "text", paras: paragraphs(content), o }); return this; }
  rect(o) { this.els.push({ kind: "rect", o }); return this; }
  roundRect(o) { this.els.push({ kind: "roundRect", o }); return this; }
  ellipse(o) { this.els.push({ kind: "ellipse", o }); return this; }
  line(o) { this.els.push({ kind: "line", o }); return this; }
  image(data, o) { this.els.push({ kind: "image", data, o }); return this; }
  notes(t) { this.notesText = t; return this; }
}

class Deck {
  constructor(meta) { this.meta = meta; this.slides = []; }
  slide(opts = {}) { const s = new Slide(opts); this.slides.push(s); return s; }

  // ---------- PPTX ----------
  async savePptx(file, theme) {
    const pres = new pptxgen();
    pres.layout = "LAYOUT_16x9";
    pres.author = this.meta.author;
    pres.company = this.meta.company;
    pres.title = this.meta.title;
    pres.subject = this.meta.subject || this.meta.title;
    pres.theme = { headFontFace: "Arial", bodyFontFace: "Calibri" };
    let section = null;
    for (const s of this.slides) {
      if (s.section && s.section !== section) { pres.addSection({ title: s.section }); section = s.section; }
      const slide = pres.addSlide(section ? { sectionTitle: section } : {});
      slide.background = { color: s.bg };
      let n = 0;
      for (const el of s.els) {
        n += 1;
        const o = { ...el.o, objectName: el.o.name || `${el.kind}-${n}` };
        delete o.name;
        if (el.kind === "text") {
          slide.addText(toRuns(el.paras, o), textBox(o));
        } else if (el.kind === "rect" || el.kind === "roundRect" || el.kind === "ellipse") {
          const type = { rect: pres.ShapeType.rect, roundRect: pres.ShapeType.roundRect, ellipse: pres.ShapeType.ellipse }[el.kind];
          const shape = { x: o.x, y: o.y, w: o.w, h: o.h, objectName: o.objectName,
            fill: o.fill ? { color: o.fill, transparency: o.transparency || 0 } : { type: "none" },
            line: o.line ? { color: o.line, width: o.lineWidth || 1 } : { type: "none" } };
          if (el.kind === "roundRect") shape.rectRadius = o.radius || 0.08;
          if (o.shadow) shape.shadow = { type: "outer", color: "000000", opacity: 0.12, blur: 6, offset: 2, angle: 90 };
          slide.addShape(type, shape);
        } else if (el.kind === "line") {
          // OOXML extents must be >= 0: PowerPoint refuses the whole file on a negative width or height.
          // An up- or left-pointing line becomes a positive box, flipped, so the arrowhead stays at (x+w, y+h).
          const w = o.w || 0, h = o.h || 0;
          slide.addShape(pres.ShapeType.line, { x: w < 0 ? o.x + w : o.x, y: h < 0 ? o.y + h : o.y,
            w: Math.abs(w), h: Math.abs(h), flipH: w < 0, flipV: h < 0, objectName: o.objectName,
            line: { color: o.color, width: o.width || 1, dashType: o.dash || "solid",
              endArrowType: o.arrow ? "triangle" : undefined } });
        } else if (el.kind === "image") {
          slide.addImage({ data: el.data, x: o.x, y: o.y, w: o.w, h: o.h, objectName: o.objectName, altText: o.alt || "" });
        }
      }
      if (s.notesText) slide.addNotes(s.notesText);
    }
    await pres.writeFile({ fileName: file });
    if (theme) {
      const { applyTheme } = require(process.env.PPTX_SKILL + "/scripts/apply_theme.js");
      await applyTheme(file, theme);
    }
  }

  // ---------- HTML preview ----------
  saveHtml(file) {
    const slides = this.slides.map((s, i) => {
      const els = s.els.map((el, j) => htmlEl(el, `s${i + 1}e${j + 1}`)).join("\n");
      return `<div class="slide" id="slide-${i + 1}" style="background:#${s.bg}">${els}
        <div class="num">${i + 1}</div></div>`;
    }).join("\n");
    const html = `<!doctype html><html><head><meta charset="utf-8"><style>
      body{margin:0;background:#888;font-family:Calibri}
      .slide{position:relative;width:${W * PX}px;height:${H * PX}px;overflow:hidden;margin:0 0 20px 0}
      .el{position:absolute;box-sizing:border-box}
      .t{display:flex;flex-direction:column;overflow:hidden}
      .t p{margin:0;white-space:pre-wrap;word-wrap:break-word}
      .num{position:absolute;right:4px;bottom:2px;font:10px Arial;color:#f0f;opacity:.0}
      .overflow{outline:2px solid #ff00ff !important}
    </style></head><body>${slides}
    <pre id="report"></pre>
    <script>
      const only = new URLSearchParams(location.search).get('slide');
      if (only) {
        document.querySelectorAll('.slide').forEach(s => { if (s.id !== 'slide-' + only) s.style.display = 'none'; else s.style.margin = '0'; });
        document.getElementById('report').style.display = 'none';
      }
      const bad = [];
      document.querySelectorAll('.t').forEach(el => {
        const inner = el.firstElementChild;
        const contentH = inner ? inner.scrollHeight : 0;
        const avail = el.clientHeight - parseFloat(getComputedStyle(el).paddingTop) - parseFloat(getComputedStyle(el).paddingBottom);
        if (contentH > avail + 1.5 || el.scrollWidth > el.clientWidth + 1.5) {
          el.classList.add('overflow');
          bad.push(el.dataset.id + ' needs ' + Math.round(contentH) + 'px, has ' + Math.round(avail) + 'px :: ' + el.innerText.slice(0, 60).replace(/\\n/g, ' '));
        }
      });
      document.getElementById('report').textContent = JSON.stringify(bad);
    </script></body></html>`;
    fs.writeFileSync(file, html);
  }
}

// pptxgenjs text options for a text box
function textBox(o) {
  return {
    x: o.x, y: o.y, w: o.w, h: o.h, objectName: o.objectName, isTextBox: true,
    margin: o.margin === undefined ? 0 : o.margin,
    valign: o.valign || "top", align: o.align || "left",
    fontFace: o.font || "Calibri", fontSize: o.size || 14, color: o.color || "1E1E1E",
    bold: !!o.bold, italic: !!o.italic, fit: "none", wrap: true,
    lineSpacingMultiple: o.lineSpacing || 1.0,
    fill: o.fill ? { color: o.fill } : undefined,
    charSpacing: o.charSpacing,
  };
}

// paragraphs -> pptxgenjs run array (paragraph props on every run of the paragraph)
function toRuns(paras, o) {
  const out = [];
  paras.forEach((p, pi) => {
    p.runs.forEach((r, ri) => {
      const last = ri === p.runs.length - 1;
      const opt = {
        bold: r.b !== undefined ? r.b : !!o.bold,
        italic: r.i !== undefined ? r.i : !!o.italic,
        color: r.color || o.color || "1E1E1E",
        fontFace: r.font || o.font || "Calibri",
        fontSize: r.size || o.size || 14,
        breakLine: last && pi < paras.length - 1,
        align: p.align || o.align || "left",
        paraSpaceAfter: p.spaceAfter !== undefined ? p.spaceAfter : (o.paraSpace || 0),
        paraSpaceBefore: p.spaceBefore || 0,
      };
      if (r.highlight) opt.highlight = r.highlight;
      if (p.bullet) opt.bullet = p.bullet === true ? { indent: o.bulletIndent || 14 } : p.bullet;
      if (r.charSpacing || o.charSpacing) opt.charSpacing = r.charSpacing || o.charSpacing;
      out.push({ text: r.text, options: opt });
    });
  });
  return out;
}

function px(v) { return (v * PX).toFixed(2) + "px"; }
function pt(v) { return (v * 96 / 72).toFixed(2) + "px"; }
function esc(t) { return String(t).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }

function htmlEl(el, id) {
  const o = el.o;
  const box = `left:${px(o.x)};top:${px(o.y)};width:${px(o.w)};height:${px(o.h || 0)};`;
  if (el.kind === "rect" || el.kind === "roundRect" || el.kind === "ellipse") {
    const radius = el.kind === "ellipse" ? "50%" : el.kind === "roundRect" ? px(o.radius || 0.08) : "0";
    const fill = o.fill ? `#${o.fill}` : "transparent";
    const opacity = o.transparency ? `opacity:${1 - o.transparency / 100};` : "";
    const border = o.line ? `border:${((o.lineWidth || 1) * 96 / 72).toFixed(2)}px solid #${o.line};` : "";
    const shadow = o.shadow ? "box-shadow:0 2px 6px rgba(0,0,0,.12);" : "";
    return `<div class="el" data-id="${id}" style="${box}background:${fill};border-radius:${radius};${border}${opacity}${shadow}"></div>`;
  }
  if (el.kind === "line") {
    const len = Math.sqrt(o.w * o.w + (o.h || 0) * (o.h || 0));
    const ang = Math.atan2(o.h || 0, o.w) * 180 / Math.PI;
    const style = o.dash && o.dash !== "solid" ? "dashed" : "solid";
    const arrow = o.arrow ? `<div style="position:absolute;right:-1px;top:-4px;width:0;height:0;border-left:9px solid #${o.color};border-top:5px solid transparent;border-bottom:5px solid transparent"></div>` : "";
    return `<div class="el" data-id="${id}" style="left:${px(o.x)};top:${px(o.y)};width:${px(len)};height:0;border-top:${((o.width || 1) * 96 / 72).toFixed(2)}px ${style} #${o.color};transform-origin:0 0;transform:rotate(${ang}deg)">${arrow}</div>`;
  }
  if (el.kind === "image") {
    return `<img class="el" data-id="${id}" src="data:${el.data.replace(/^data:/, "")}" style="${box}">`;
  }
  // text
  const m = o.margin === undefined ? 0 : o.margin;
  const pad = Array.isArray(m) ? `padding:${pt(m[3])} ${pt(m[1])} ${pt(m[2])} ${pt(m[0])};` : `padding:${pt(m)};`;
  const justify = { top: "flex-start", middle: "center", bottom: "flex-end" }[o.valign || "top"];
  const fill = o.fill ? `background:#${o.fill};` : "";
  const paras = el.paras.map(p => {
    const font = (p.runs[0] && p.runs[0].font) || o.font || "Calibri";
    const size = (p.runs[0] && p.runs[0].size) || o.size || 14;
    const lh = (LINE[font] || 1.2) * (o.lineSpacing || 1.0);
    const align = p.align || o.align || "left";
    const after = p.spaceAfter !== undefined ? p.spaceAfter : (o.paraSpace || 0);
    const before = p.spaceBefore || 0;
    const indent = p.bullet ? (o.bulletIndent || 14) : 0;
    const bulletHtml = p.bullet ? `<span style="position:absolute;left:0">&#8226;</span>` : "";
    const runs = p.runs.map(r => {
      const st = [
        `font-family:${r.font || o.font || "Calibri"}`,
        `font-size:${pt(r.size || o.size || 14)}`,
        `color:#${r.color || o.color || "1E1E1E"}`,
        `font-weight:${(r.b !== undefined ? r.b : o.bold) ? 700 : 400}`,
        `font-style:${(r.i !== undefined ? r.i : o.italic) ? "italic" : "normal"}`,
        r.highlight ? `background:#${r.highlight}` : "",
        (r.charSpacing || o.charSpacing) ? `letter-spacing:${pt(r.charSpacing || o.charSpacing)}` : "",
      ].join(";");
      return `<span style="${st}">${esc(r.text) || "&#8203;"}</span>`;
    }).join("");
    return `<p style="position:relative;font-family:${font};font-size:${pt(size)};text-align:${align};line-height:${(lh * size * 96 / 72).toFixed(2)}px;margin-top:${pt(before)};margin-bottom:${pt(after)};padding-left:${pt(indent)}">${bulletHtml}${runs}</p>`;
  }).join("");
  return `<div class="el t" data-id="${id}" style="${box}${pad}${fill}justify-content:${justify}"><div>${paras}</div></div>`;
}

module.exports = { Deck, W, H };

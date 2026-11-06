// sef.js — SE Factory slide components (the look of "Applied AI Engineering Workshop - RAG.pptx")
// Dark slides (283338) for titles, dividers and live coding; light slides (F9FAFB) for content.

const React = require("react");
const ReactDOMServer = require("react-dom/server");
const sharp = require("sharp");

const C = {
  dark: "283338", green: "01D294", deep: "007B66", teal: "0FAA84", logo: "08B790",
  mint: "DAFFEC", mint2: "D4F5F0", pale: "EEF9F5", mintText: "8CCFBD",
  red: "E5534B", amber: "E9B122", amberDeep: "8A5A00", ink: "1E1E1E", slate: "364153", gray: "5A606B",
  // text-safe variants (>= 4.5:1 on white): brand red/teal stay for bars, borders and edges
  redText: "C0392B", tealText: "0B8A6B",
  line: "E5E7EB", bg: "F9FAFB", soft: "F3F4F6", white: "FFFFFF", code: "1F272B", codeText: "E5E7EB",
  redSoft: "FDECEB", amberSoft: "FDF4DC", greenSoft: "E3F8F1",
};

const THEME = {
  name: "SE Factory",
  headFontFace: "Arial",
  bodyFontFace: "Calibri",
  colors: {
    dk1: C.ink, lt1: C.white, dk2: C.dark, lt2: C.bg,
    accent1: C.green, accent2: C.deep, accent3: C.teal, accent4: C.amber, accent5: C.red, accent6: C.gray,
    hlink: C.deep, folHlink: C.teal,
  },
};

// ---------- icons ----------
const iconCache = new Map();
async function icon(Component, color = C.deep, size = 256) {
  const key = (Component.displayName || Component.name) + color;
  if (iconCache.has(key)) return iconCache.get(key);
  const svg = ReactDOMServer.renderToStaticMarkup(React.createElement(Component, { color: "#" + color, size }));
  const png = await sharp(Buffer.from(svg)).resize(size, size).png().toBuffer();
  const data = "image/png;base64," + png.toString("base64");
  iconCache.set(key, data);
  return data;
}

// ---------- brand ----------
function logo(s, x, y, onDark = true) {
  s.roundRect({ x, y, w: 0.46, h: 0.36, fill: C.logo, radius: 0.06, name: "logo-mark" });
  s.text("SE", { x, y, w: 0.46, h: 0.36, font: "Arial", size: 13, bold: true, color: C.white, align: "center", valign: "middle", name: "logo-se" });
  s.text("Factory", { x: x + 0.54, y, w: 0.9, h: 0.36, font: "Arial", size: 14, bold: true, color: onDark ? C.white : C.dark, valign: "middle", name: "logo-factory" });
}

function circles(s, big = true) {
  if (big) {
    s.ellipse({ x: 7.5, y: -1.5, w: 4.5, h: 4.5, fill: C.teal, name: "deco-circle-1" });
    s.ellipse({ x: 8.2, y: -0.8, w: 3.0, h: 3.0, fill: C.green, name: "deco-circle-2" });
  } else {
    s.ellipse({ x: 8.0, y: -1.0, w: 4.0, h: 4.0, fill: C.teal, name: "deco-circle-1" });
  }
}

function slideNumber(s, n, onDark) {
  s.text(String(n), { x: 9.35, y: 5.3, w: 0.45, h: 0.22, size: 9, color: onDark ? C.mintText : C.gray, align: "right", name: "slide-number" });
}

// ---------- slide frames ----------
// Title / divider: big two-line title, kicker above, subtitle below, a footer line.
function darkSlide(deck, o) {
  const s = deck.slide({ bg: C.dark, section: o.section });
  circles(s, true);
  if (o.icon) s.image(o.icon, { x: 0.6, y: 0.6, w: 0.7, h: 0.7, name: "title-icon" });
  s.text(o.kicker, { x: 0.6, y: 1.5, w: 7.6, h: 0.35, size: 11, bold: true, color: C.green, charSpacing: 1, name: "kicker" });
  s.text(o.title1, { x: 0.6, y: 1.9, w: 8.8, h: 0.85, font: "Arial", size: o.titleSize || 48, bold: true, color: C.white, name: "title" });
  if (o.title2) s.text(o.title2, { x: 0.6, y: 2.72, w: 8.8, h: 0.85, font: "Arial", size: o.titleSize || 48, bold: true, italic: true, color: C.green, name: "title-2" });
  if (o.subtitle) s.text(o.subtitle, { x: 0.6, y: 3.75, w: 8.2, h: 0.75, size: 18, italic: true, color: C.mint, name: "subtitle" });
  // optional detail line under the subtitle (e.g. the questions a part answers)
  if (o.detail) s.text(o.detail, { x: 0.6, y: 4.3, w: 8.2, h: 0.6, size: 12.5, color: C.mintText, name: "detail" });
  if (o.footer) {
    s.rect({ x: 0.6, y: 5.1, w: 0.8, h: 0.05, fill: C.green, name: "footer-rule" });
    s.text(o.footer, { x: 0.6, y: 5.2, w: 7.0, h: 0.3, size: 12, color: C.mint, name: "footer" });
  }
  if (o.logo !== false) logo(s, 7.98, 5.1, true);
  if (o.notes) s.notes(o.notes);
  return s;
}

// Light content slide: title + italic subtitle. Returns the slide; content goes between y=1.55 and y=5.0.
function contentSlide(deck, o) {
  const s = deck.slide({ bg: C.bg, section: o.section });
  s.text(o.title, { x: 0.6, y: 0.4, w: 8.8, h: 0.6, font: "Arial", size: o.titleSize || 26, bold: true, color: C.dark, valign: "middle", name: "title" });
  if (o.subtitle) s.text(o.subtitle, { x: 0.6, y: 1.0, w: 8.8, h: 0.42, size: 14, italic: true, color: C.gray, valign: "top", name: "subtitle" });
  if (o.takeaway) takeaway(s, o.takeaway);
  if (o.notes) s.notes(o.notes);
  return s;
}

// Live coding / demo slide (dark, one circle)
function liveSlide(deck, o) {
  const s = deck.slide({ bg: C.dark, section: o.section });
  circles(s, false);
  if (o.icon) s.image(o.icon, { x: 0.6, y: 0.55, w: 0.6, h: 0.6, name: "live-icon" });
  s.text(o.kicker || "LIVE", { x: 0.6, y: 1.3, w: 5, h: 0.4, size: 14, bold: true, color: C.green, charSpacing: 1, name: "kicker" });
  s.text(o.title1, { x: 0.6, y: 1.7, w: 8.8, h: 0.75, font: "Arial", size: 40, bold: true, color: C.mint2, name: "title" });
  if (o.title2) s.text(o.title2, { x: 0.6, y: 2.4, w: 8.8, h: 0.7, font: "Arial", size: 32, bold: true, italic: true, color: C.mint2, name: "title-2" });
  (o.steps || []).forEach((step, i) => {
    const y = 3.4 + i * 0.42;
    s.ellipse({ x: 0.6, y, w: 0.3, h: 0.3, fill: C.green, name: `step-dot-${i + 1}` });
    s.text(String(i + 1), { x: 0.6, y, w: 0.3, h: 0.3, font: "Arial", size: 11, bold: true, color: C.dark, align: "center", valign: "middle", name: `step-num-${i + 1}` });
    s.text(step, { x: 1.05, y: y - 0.03, w: 8.4, h: 0.36, size: 13, color: C.mintText, valign: "middle", name: `step-${i + 1}` });
  });
  if (o.command) s.text(o.command, { x: 0.6, y: 5.12, w: 8.8, h: 0.3, font: "Consolas", size: 11, color: C.green, name: "command" });
  if (o.notes) s.notes(o.notes);
  return s;
}

function takeaway(s, text, color) {
  s.text(text, { x: 0.6, y: 5.12, w: 8.6, h: 0.32, size: 12, italic: true, color: color || C.gray, valign: "middle", name: "takeaway" });
}

// ---------- components ----------
// A card: white, thin border, optional coloured edge, icon, number, title, body.
function card(s, o) {
  const fill = o.fill || C.white;
  s.rect({ x: o.x, y: o.y, w: o.w, h: o.h, fill, line: o.border || C.line, lineWidth: 1, name: (o.name || "card") + "-box" });
  if (o.edge) s.rect({ x: o.x, y: o.y, w: 0.07, h: o.h, fill: o.edge, name: (o.name || "card") + "-edge" });
  let ty = o.y + 0.16;
  const tx = o.x + (o.edge ? 0.25 : 0.2);
  const tw = o.w - (o.edge ? 0.4 : 0.35);
  if (o.icon || o.num) {
    if (o.num) {
      s.ellipse({ x: tx, y: ty, w: 0.4, h: 0.4, fill: o.numColor || C.deep, name: (o.name || "card") + "-num-dot" });
      s.text(String(o.num), { x: tx, y: ty, w: 0.4, h: 0.4, font: "Arial", size: 13, bold: true, color: C.white, align: "center", valign: "middle", name: (o.name || "card") + "-num" });
    }
    if (o.icon) s.image(o.icon, { x: o.num ? o.x + o.w - 0.55 : tx, y: ty, w: 0.38, h: 0.38, name: (o.name || "card") + "-icon" });
    if (o.num && o.title && !o.icon) {
      // number and title on one row
      s.text(o.title, { x: tx + 0.52, y: ty, w: tw - 0.52, h: 0.4, font: "Arial", size: o.titleSize || 14, bold: true, color: o.titleColor || C.dark, valign: "middle", name: (o.name || "card") + "-title" });
      ty += 0.5;
      o = { ...o, title: null };
    } else if (o.iconInline && o.title) {
      s.text(o.title, { x: tx + 0.5, y: ty, w: tw - 0.5, h: 0.38, font: "Arial", size: o.titleSize || 14, bold: true, color: o.titleColor || C.dark, valign: "middle", name: (o.name || "card") + "-title" });
      ty += 0.5;
    } else {
      ty += 0.5;
    }
  }
  if (o.title && !o.iconInline) {
    s.text(o.title, { x: tx, y: ty, w: tw, h: o.titleH || 0.36, font: "Arial", size: o.titleSize || 14, bold: true, color: o.titleColor || C.dark, valign: "top", name: (o.name || "card") + "-title" });
    ty += (o.titleH || 0.36) + 0.04;
  }
  if (o.body) {
    s.text(o.body, { x: tx, y: ty, w: tw, h: o.y + o.h - ty - 0.1, size: o.bodySize || 11.5, color: o.bodyColor || C.slate, paraSpace: o.paraSpace || 3, name: (o.name || "card") + "-body", bulletIndent: 12 });
  }
}

function darkCard(s, o) {
  card(s, { ...o, fill: C.dark, border: C.dark, titleColor: C.white, bodyColor: "E8F4EF" });
}

function stat(s, o) {
  s.text(o.value, { x: o.x, y: o.y, w: o.w, h: o.h || 0.75, font: "Arial", size: o.size || 40, bold: true, color: o.color || C.deep, align: o.align || "left", valign: "bottom", name: (o.name || "stat") + "-value" });
  s.text(o.label, { x: o.x, y: o.y + (o.h || 0.75) + 0.02, w: o.w, h: o.labelH || 0.5, size: o.labelSize || 11.5, color: o.labelColor || C.gray, align: o.align || "left", name: (o.name || "stat") + "-label" });
}

function chip(s, o) {
  s.roundRect({ x: o.x, y: o.y, w: o.w, h: o.h || 0.28, fill: o.fill || C.pale, radius: 0.06, name: (o.name || "chip") + "-bg" });
  s.text(o.text, { x: o.x, y: o.y, w: o.w, h: o.h || 0.28, size: o.size || 10, bold: o.bold !== false, color: o.color || C.deep, align: "center", valign: "middle", font: o.font || "Calibri", name: (o.name || "chip") + "-text" });
}

// Code block: dark box, Consolas. lines: array of strings or {text, color}
function code(s, o) {
  s.roundRect({ x: o.x, y: o.y, w: o.w, h: o.h, fill: C.code, radius: 0.06, name: (o.name || "code") + "-bg" });
  if (o.label) s.text(o.label, { x: o.x + 0.15, y: o.y + 0.08, w: o.w - 0.3, h: 0.24, size: 9, bold: true, color: C.green, charSpacing: 1, name: (o.name || "code") + "-label" });
  const lines = (o.lines || []).map(l => (typeof l === "string" ? { text: l } : l));
  const paras = lines.map(l => {
    if (l.color) return { runs: [{ text: l.text, color: l.color, b: !!l.b }] };
    if (l.text.trim().startsWith("#")) return { runs: [{ text: l.text, color: C.mintText }] };
    const cut = l.text.indexOf("  # ");  // an inline comment gets the comment colour
    if (cut > 0) return { runs: [{ text: l.text.slice(0, cut), color: C.codeText }, { text: l.text.slice(cut), color: C.mintText }] };
    return { runs: [{ text: l.text, color: C.codeText, b: !!l.b }] };
  });
  const top = o.label ? 0.34 : 0.12;
  s.text(paras, { x: o.x + 0.15, y: o.y + top, w: o.w - 0.3, h: o.h - top - 0.08, font: "Consolas", size: o.size || 10, color: C.codeText, name: (o.name || "code") + "-text" });
}

// Table from rects and text boxes. cols: widths (in), header: [..], rows: [[..]], cell can be string or {text,color,b,fill}
function table(s, o) {
  const rowH = o.rowH || 0.34, headH = o.headH || rowH;
  let x0 = o.x;
  const total = o.cols.reduce((a, b) => a + b, 0);
  if (o.header) {
    s.rect({ x: o.x, y: o.y, w: total, h: headH, fill: o.headFill || C.dark, name: (o.name || "table") + "-head" });
    o.header.forEach((h, i) => {
      const cell = typeof h === "string" ? { text: h } : h;
      s.text(cell.text, { x: x0 + 0.08, y: o.y, w: o.cols[i] - 0.16, h: headH, size: o.headSize || 10.5, bold: true, color: o.headColor || C.white, valign: "middle", align: cell.align || (i === 0 ? "left" : o.align || "left"), name: `${o.name || "table"}-h${i}` });
      x0 += o.cols[i];
    });
  }
  let y = o.y + (o.header ? headH : 0);
  o.rows.forEach((row, r) => {
    const h = (o.rowHeights && o.rowHeights[r]) || rowH;
    const isArr = Array.isArray(row);
    s.rect({ x: o.x, y, w: total, h, fill: (!isArr && row.fill) || (r % 2 ? (o.zebra || C.white) : C.white), line: C.line, lineWidth: 0.75, name: `${o.name || "table"}-r${r}` });
    let x = o.x;
    (isArr ? row : row.cells).forEach((c, i) => {
      const cell = typeof c === "string" ? { text: c } : c;
      if (cell.fill) s.rect({ x: x + 0.01, y: y + 0.01, w: o.cols[i] - 0.02, h: h - 0.02, fill: cell.fill, name: `${o.name || "table"}-c${r}-${i}-fill` });
      s.text(cell.runs ? [cell.runs] : cell.text, { x: x + 0.08, y, w: o.cols[i] - 0.16, h, size: cell.size || o.size || 10.5, bold: !!cell.b, italic: !!cell.i, color: cell.color || C.slate, valign: "middle", align: cell.align || (i === 0 ? "left" : o.align || "left"), font: cell.font || "Calibri", name: `${o.name || "table"}-c${r}-${i}` });
      x += o.cols[i];
    });
    y += h;
  });
  return y;
}

function arrow(s, x1, y1, x2, y2, color = C.gray, width = 1.5) {
  s.line({ x: x1, y: y1, w: x2 - x1, h: y2 - y1, color, width, arrow: true, name: "arrow" });
}

module.exports = { C, THEME, icon, logo, circles, slideNumber, darkSlide, contentSlide, liveSlide, takeaway, card, darkCard, stat, chip, code, table, arrow };

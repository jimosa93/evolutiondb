import fs from "node:fs/promises";
import path from "node:path";

import { PDFDocument, PDFEmbeddedPage, PDFImage, PDFPage, PDFFont, StandardFonts, rgb } from "pdf-lib";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";

const COLORS = {
  blue: rgb(0.07, 0.32, 0.68),
  darkBlue: rgb(0.03, 0.13, 0.34),
  midBlue: rgb(0.12, 0.31, 0.68),
  sky: rgb(0.14, 0.39, 0.86),
  green: rgb(0.24, 0.65, 0.23),
  slate: rgb(0.12, 0.16, 0.24),
  muted: rgb(0.42, 0.48, 0.58),
  border: rgb(0.86, 0.9, 0.95),
  white: rgb(1, 1, 1),
  yellow: rgb(0.96, 0.79, 0.25),
  black: rgb(0, 0, 0),
};

const HEADER_HEIGHT = 96;
const FOOTER_HEIGHT = 78;
const FOOTER_MASK_HEIGHT = 108;

const CERTIFICAR_QUERY_TYPES = ["RECIENTE", "PLUS", "ELITE", "PREMIUM"] as const;

type Fonts = {
  regular: PDFFont;
  bold: PDFFont;
};

export type CertificarQueryType = (typeof CERTIFICAR_QUERY_TYPES)[number];

export type ProcessCertificarPdfOptions = {
  queryType?: CertificarQueryType;
  addContactNumber?: boolean;
};

type CertificarReport = {
  plate: string;
  brand: string;
  model: string;
  year: string;
  vehicleType: string;
  color: string;
  fuel: string;
  queryDate: string;
  reportNumber: string;
  queryType: string;
};

function isPdf(bytes: Uint8Array) {
  return bytes.byteLength >= 5 && String.fromCharCode(...bytes.slice(0, 4)) === "%PDF";
}

function normalizeText(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function valueAfter(text: string, label: string) {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return text.match(new RegExp(`${escaped}\\s+([^\\n]+)`, "i"))?.[1]?.trim() ?? "";
}

function formatReportNumber(report: CertificarReport) {
  const dateParts = report.queryDate.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  const suffix = (report.reportNumber.replace(/[^a-zA-Z0-9]/g, "").slice(-5) || report.plate || "00000").toUpperCase();
  if (!dateParts) {
    return `AC-${suffix}`;
  }

  return `AC-${dateParts[3]}-${dateParts[2]}${dateParts[1]}-${suffix}`;
}

async function extractTokens(pdfBytes: Uint8Array) {
  const task = pdfjs.getDocument({ data: Uint8Array.from(pdfBytes) });
  const document = await task.promise;
  const tokens: string[] = [];

  try {
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      const content = await page.getTextContent();
      tokens.push(
        ...content.items
          .map((item) => ("str" in item ? item.str : ""))
          .map((item) => item.trim())
          .filter(Boolean),
      );
    }
  } finally {
    await task.destroy();
  }

  return tokens;
}

function nextToken(tokens: string[], label: string) {
  const index = tokens.findIndex((token) => token.toLowerCase() === label.toLowerCase());
  return index >= 0 ? tokens[index + 1] ?? "" : "";
}

function previousToken(tokens: string[], label: string) {
  const index = tokens.findIndex((token) => token.toLowerCase() === label.toLowerCase());
  return index > 0 ? tokens[index - 1] ?? "" : "";
}

function groupedValue(tokens: string[], labels: string[], label: string) {
  const labelIndex = labels.findIndex((candidate) => candidate === label);
  if (labelIndex < 0) {
    return "";
  }

  for (let start = 0; start <= tokens.length - labels.length; start += 1) {
    if (labels.every((candidate, index) => tokens[start + index] === candidate)) {
      return tokens[start + labels.length + labelIndex] ?? "";
    }
  }

  return "";
}

function parseCertificarReport(tokens: string[]): CertificarReport {
  const text = tokens.join("\n");
  const normalized = normalizeText(text);
  const primaryGroup = [
    "Color",
    "Marca",
    "Modelo",
    "Número chasis",
    "Tipo de combustible",
    "Número de chasis",
    "Número VIN",
  ];
  const vehicleGroup = ["Año", "Placa", "Tipo de vehículo"];
  const plate = groupedValue(tokens, vehicleGroup, "Placa") || (normalized.match(/\b[A-Z]{3}\d{3}\b/)?.[0] ?? "");
  const queryDate = nextToken(tokens, "Fecha realizado") || valueAfter(text, "Fecha realizado");
  const reportNumber = previousToken(tokens, "Empresa") || valueAfter(text, "Reporte Nº") || valueAfter(text, "Reporte No");

  return {
    plate,
    brand: groupedValue(tokens, primaryGroup, "Marca") || valueAfter(text, "Marca"),
    model: groupedValue(tokens, primaryGroup, "Modelo") || valueAfter(text, "Modelo"),
    year: groupedValue(tokens, vehicleGroup, "Año") || valueAfter(text, "Año"),
    vehicleType: groupedValue(tokens, vehicleGroup, "Tipo de vehículo") || valueAfter(text, "Tipo de vehículo"),
    color: groupedValue(tokens, primaryGroup, "Color") || valueAfter(text, "Color"),
    fuel: groupedValue(tokens, primaryGroup, "Tipo de combustible") || valueAfter(text, "Tipo de combustible"),
    queryDate,
    reportNumber,
    queryType: nextToken(tokens, "Tipo Consulta") || valueAfter(text, "Tipo Consulta") || "AUTOCHECK PREMIUM",
  };
}

export function isCertificarQueryType(value: string): value is CertificarQueryType {
  return CERTIFICAR_QUERY_TYPES.includes(value as CertificarQueryType);
}

function fitText(font: PDFFont, text: string, maxWidth: number, initialSize: number, minSize = 6) {
  let size = initialSize;
  while (size > minSize && font.widthOfTextAtSize(text, size) > maxWidth) {
    size -= 0.5;
  }
  return size;
}

function truncateText(font: PDFFont, text: string, size: number, maxWidth: number) {
  if (font.widthOfTextAtSize(text, size) <= maxWidth) {
    return text;
  }

  let truncated = text;
  while (truncated.length > 1 && font.widthOfTextAtSize(`${truncated}...`, size) > maxWidth) {
    truncated = truncated.slice(0, -1);
  }

  return `${truncated.trimEnd()}...`;
}

function drawText(page: PDFPage, text: string, x: number, y: number, fonts: Fonts, options: {
  size?: number;
  bold?: boolean;
  color?: ReturnType<typeof rgb>;
  maxWidth?: number;
} = {}) {
  const font = options.bold ? fonts.bold : fonts.regular;
  const size = options.maxWidth ? fitText(font, text, options.maxWidth, options.size ?? 9) : options.size ?? 9;
  const displayText = options.maxWidth ? truncateText(font, text, size, options.maxWidth) : text;
  page.drawText(displayText, {
    x,
    y,
    size,
    font,
    color: options.color ?? COLORS.slate,
  });
}

function drawCenteredText(page: PDFPage, text: string, centerX: number, y: number, maxWidth: number, fonts: Fonts, options: {
  size?: number;
  bold?: boolean;
  color?: ReturnType<typeof rgb>;
} = {}) {
  const font = options.bold ? fonts.bold : fonts.regular;
  const size = fitText(font, text, maxWidth, options.size ?? 9);
  const displayText = truncateText(font, text, size, maxWidth);
  page.drawText(displayText, {
    x: centerX - font.widthOfTextAtSize(displayText, size) / 2,
    y,
    size,
    font,
    color: options.color ?? COLORS.slate,
  });
}

function drawWrappedText(page: PDFPage, text: string, x: number, y: number, maxWidth: number, fonts: Fonts, options: {
  size?: number;
  bold?: boolean;
  color?: ReturnType<typeof rgb>;
  lineHeight?: number;
  maxLines?: number;
} = {}) {
  const font = options.bold ? fonts.bold : fonts.regular;
  const size = options.size ?? 8;
  const lineHeight = options.lineHeight ?? size + 2;
  const words = normalizeText(text).split(" ");
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
      current = candidate;
    } else {
      if (current) lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);

  for (const [index, line] of lines.slice(0, options.maxLines ?? lines.length).entries()) {
    drawText(page, line, x, y - index * lineHeight, fonts, {
      size,
      bold: options.bold,
      color: options.color,
    });
  }
}

function roundedRectPath(width: number, height: number, radius: number) {
  return [
    `M ${radius} 0`,
    `L ${width - radius} 0`,
    `Q ${width} 0 ${width} ${radius}`,
    `L ${width} ${height - radius}`,
    `Q ${width} ${height} ${width - radius} ${height}`,
    `L ${radius} ${height}`,
    `Q 0 ${height} 0 ${height - radius}`,
    `L 0 ${radius}`,
    `Q 0 0 ${radius} 0`,
    "Z",
  ].join(" ");
}

function drawRoundedRect(page: PDFPage, x: number, y: number, width: number, height: number, radius: number, options: {
  color?: ReturnType<typeof rgb>;
  borderColor?: ReturnType<typeof rgb>;
  borderWidth?: number;
}) {
  page.drawSvgPath(roundedRectPath(width, height, radius), {
    x,
    y: y + height,
    color: options.color,
    borderColor: options.borderColor,
    borderWidth: options.borderWidth,
  });
}

function drawIconShield(page: PDFPage, x: number, y: number, color: ReturnType<typeof rgb>) {
  page.drawSvgPath("M 12 2 L 20 6 L 20 12 C 20 16 17 19 12 21 C 7 19 4 16 4 12 L 4 6 Z M 8.5 11.8 L 11 14.2 L 16 9", {
    x,
    y: y + 24,
    scale: 0.9,
    borderColor: color,
    borderWidth: 1.6,
  });
}

function drawSmallCar(page: PDFPage, x: number, y: number, color: ReturnType<typeof rgb>) {
  page.drawRectangle({ x: x + 3, y: y + 5, width: 25, height: 10, borderColor: color, borderWidth: 1 });
  page.drawRectangle({ x: x + 8, y: y + 15, width: 15, height: 8, borderColor: color, borderWidth: 1 });
  page.drawCircle({ x: x + 8, y: y + 4, size: 2.4, color });
  page.drawCircle({ x: x + 23, y: y + 4, size: 2.4, color });
}

function drawDatabaseIcon(page: PDFPage, x: number, y: number, color: ReturnType<typeof rgb>) {
  page.drawEllipse({ x: x + 10, y: y + 18, xScale: 9, yScale: 4, borderColor: color, borderWidth: 1.3 });
  page.drawLine({ start: { x: x + 1, y: y + 18 }, end: { x: x + 1, y: y + 7 }, thickness: 1.3, color });
  page.drawLine({ start: { x: x + 19, y: y + 18 }, end: { x: x + 19, y: y + 7 }, thickness: 1.3, color });
  page.drawEllipse({ x: x + 10, y: y + 12.5, xScale: 9, yScale: 4, borderColor: color, borderWidth: 1.3 });
  page.drawEllipse({ x: x + 10, y: y + 7, xScale: 9, yScale: 4, borderColor: color, borderWidth: 1.3 });
}

function drawAnalysisIcon(page: PDFPage, x: number, y: number, color: ReturnType<typeof rgb>) {
  page.drawCircle({ x: x + 9, y: y + 12, size: 9, borderColor: color, borderWidth: 1.1 });
  page.drawLine({ start: { x: x + 15, y: y + 5 }, end: { x: x + 23, y: y - 3 }, thickness: 1.4, color });
  page.drawLine({ start: { x: x + 3, y: y + 12 }, end: { x: x + 7, y: y + 12 }, thickness: 1, color });
  page.drawLine({ start: { x: x + 7, y: y + 12 }, end: { x: x + 9, y: y + 16 }, thickness: 1, color });
  page.drawLine({ start: { x: x + 9, y: y + 16 }, end: { x: x + 12, y: y + 8 }, thickness: 1, color });
  page.drawLine({ start: { x: x + 12, y: y + 8 }, end: { x: x + 15, y: y + 12 }, thickness: 1, color });
}

function drawLockIcon(page: PDFPage, x: number, y: number, color: ReturnType<typeof rgb>) {
  page.drawRectangle({ x: x + 2, y, width: 17, height: 14, borderColor: color, borderWidth: 1.1 });
  page.drawCircle({ x: x + 10.5, y: y + 9, size: 1.2, color });
  page.drawLine({ start: { x: x + 10.5, y: y + 8 }, end: { x: x + 10.5, y: y + 5 }, thickness: 1, color });
  page.drawLine({ start: { x: x + 6, y: y + 14 }, end: { x: x + 6, y: y + 20 }, thickness: 1.1, color });
  page.drawLine({ start: { x: x + 15, y: y + 14 }, end: { x: x + 15, y: y + 20 }, thickness: 1.1, color });
  page.drawLine({ start: { x: x + 6, y: y + 20 }, end: { x: x + 15, y: y + 20 }, thickness: 1.1, color });
}

function drawFuelIcon(page: PDFPage, x: number, y: number, color: ReturnType<typeof rgb>) {
  page.drawRectangle({ x, y, width: 10, height: 17, borderColor: color, borderWidth: 1 });
  page.drawLine({ start: { x: x + 2, y: y + 12 }, end: { x: x + 8, y: y + 12 }, thickness: 0.8, color });
  page.drawLine({ start: { x: x + 10, y: y + 14 }, end: { x: x + 15, y: y + 10 }, thickness: 1, color });
  page.drawLine({ start: { x: x + 15, y: y + 10 }, end: { x: x + 15, y: y + 2 }, thickness: 1, color });
}

function drawGlobeIcon(page: PDFPage, x: number, y: number, color: ReturnType<typeof rgb>) {
  page.drawCircle({ x: x + 7, y: y + 7, size: 6.2, borderColor: color, borderWidth: 1 });
  page.drawLine({ start: { x: x + 1, y: y + 7 }, end: { x: x + 13, y: y + 7 }, thickness: 0.75, color });
  page.drawLine({ start: { x: x + 7, y: y + 0.8 }, end: { x: x + 7, y: y + 13.2 }, thickness: 0.75, color });
  page.drawEllipse({ x: x + 7, y: y + 7, xScale: 2.9, yScale: 6.2, borderColor: color, borderWidth: 0.75 });
}

function drawWhatsappIcon(page: PDFPage, x: number, y: number, color: ReturnType<typeof rgb>) {
  page.drawCircle({ x: x + 7, y: y + 7, size: 6.2, borderColor: color, borderWidth: 1.1 });
  page.drawLine({ start: { x: x + 3.2, y: y + 2.7 }, end: { x: x + 4.8, y: y + 4.7 }, thickness: 1.1, color });
  page.drawLine({ start: { x: x + 3.2, y: y + 2.7 }, end: { x: x + 5.8, y: y + 3.4 }, thickness: 1.1, color });
  page.drawLine({ start: { x: x + 4.9, y: y + 8.8 }, end: { x: x + 7.1, y: y + 6.6 }, thickness: 1.15, color });
  page.drawLine({ start: { x: x + 4.9, y: y + 8.8 }, end: { x: x + 6.9, y: y + 11.1 }, thickness: 1.15, color });
  page.drawLine({ start: { x: x + 6.9, y: y + 11.1 }, end: { x: x + 10.4, y: y + 13 }, thickness: 1.15, color });
  page.drawLine({ start: { x: x + 10.4, y: y + 13 }, end: { x: x + 12.6, y: y + 10.8 }, thickness: 1.15, color });
}

function drawMailIcon(page: PDFPage, x: number, y: number, color: ReturnType<typeof rgb>) {
  page.drawRectangle({ x, y: y + 1, width: 14, height: 10, borderColor: color, borderWidth: 0.95 });
  page.drawLine({ start: { x, y: y + 11 }, end: { x: x + 7, y: y + 5.5 }, thickness: 0.85, color });
  page.drawLine({ start: { x: x + 14, y: y + 11 }, end: { x: x + 7, y: y + 5.5 }, thickness: 0.85, color });
}

function drawSmallShieldIcon(page: PDFPage, x: number, y: number, color: ReturnType<typeof rgb>) {
  page.drawSvgPath("M 12 2 L 20 6 L 20 12 C 20 16 17 19 12 21 C 7 19 4 16 4 12 L 4 6 Z M 9 12 L 11 14 L 15 10", {
    x,
    y: y + 15,
    scale: 0.55,
    borderColor: color,
    borderWidth: 1.25,
  });
}

function drawHeaderShieldIcon(page: PDFPage, x: number, y: number, color: ReturnType<typeof rgb>) {
  page.drawSvgPath("M 12 2 L 19 5.5 L 19 11 C 19 15 16.2 18 12 19.8 C 7.8 18 5 15 5 11 L 5 5.5 Z M 9 11 L 11 13 L 15.3 8.7", {
    x,
    y: y + 12,
    scale: 0.45,
    borderColor: color,
    borderWidth: 1.35,
  });
}

function drawTinyCarIcon(page: PDFPage, x: number, y: number, color: ReturnType<typeof rgb>) {
  page.drawRectangle({ x: x + 1.2, y: y + 3.4, width: 11.8, height: 5.2, borderColor: color, borderWidth: 0.75 });
  page.drawRectangle({ x: x + 4.1, y: y + 8.6, width: 6.3, height: 3.4, borderColor: color, borderWidth: 0.75 });
  page.drawCircle({ x: x + 4.1, y: y + 2.9, size: 1.2, color });
  page.drawCircle({ x: x + 10.4, y: y + 2.9, size: 1.2, color });
}

function drawTinyTruckIcon(page: PDFPage, x: number, y: number, color: ReturnType<typeof rgb>) {
  page.drawRectangle({ x: x + 1, y: y + 3.5, width: 8, height: 5.3, borderColor: color, borderWidth: 0.75 });
  page.drawRectangle({ x: x + 9, y: y + 4, width: 4.5, height: 4.4, borderColor: color, borderWidth: 0.75 });
  page.drawCircle({ x: x + 4, y: y + 2.9, size: 1.15, color });
  page.drawCircle({ x: x + 11.2, y: y + 2.9, size: 1.15, color });
}

function drawTinyCalendarIcon(page: PDFPage, x: number, y: number, color: ReturnType<typeof rgb>) {
  page.drawRectangle({ x: x + 1, y: y + 0.5, width: 10, height: 10, borderColor: color, borderWidth: 0.75 });
  page.drawLine({ start: { x: x + 1, y: y + 7.5 }, end: { x: x + 11, y: y + 7.5 }, thickness: 0.7, color });
  page.drawLine({ start: { x: x + 3.5, y: y + 12.2 }, end: { x: x + 3.5, y: y + 9.4 }, thickness: 0.75, color });
  page.drawLine({ start: { x: x + 8.5, y: y + 12.2 }, end: { x: x + 8.5, y: y + 9.4 }, thickness: 0.75, color });
  page.drawCircle({ x: x + 4, y: y + 4.8, size: 0.45, color });
  page.drawCircle({ x: x + 6, y: y + 4.8, size: 0.45, color });
  page.drawCircle({ x: x + 8, y: y + 4.8, size: 0.45, color });
}

function drawTinyFuelIcon(page: PDFPage, x: number, y: number, color: ReturnType<typeof rgb>) {
  page.drawRectangle({ x: x + 1, y, width: 5.5, height: 10, borderColor: color, borderWidth: 0.75 });
  page.drawLine({ start: { x: x + 2, y: y + 7 }, end: { x: x + 5.5, y: y + 7 }, thickness: 0.55, color });
  page.drawLine({ start: { x: x + 6.5, y: y + 8.5 }, end: { x: x + 10, y: y + 5.5 }, thickness: 0.75, color });
  page.drawLine({ start: { x: x + 10, y: y + 5.5 }, end: { x: x + 10, y: y + 2 }, thickness: 0.75, color });
}

function drawTinyCircleIcon(page: PDFPage, x: number, y: number, color: ReturnType<typeof rgb>) {
  page.drawCircle({ x: x + 6, y: y + 6, size: 5, borderColor: color, borderWidth: 0.75 });
  page.drawCircle({ x: x + 8, y: y + 7.3, size: 0.85, color });
  page.drawCircle({ x: x + 5.1, y: y + 4.4, size: 0.85, color });
}

function drawCalendarIcon(page: PDFPage, x: number, y: number, color: ReturnType<typeof rgb>) {
  page.drawRectangle({ x, y, width: 18, height: 18, borderColor: color, borderWidth: 1.1 });
  page.drawLine({ start: { x, y: y + 13 }, end: { x: x + 18, y: y + 13 }, thickness: 1.1, color });
  page.drawLine({ start: { x: x + 5, y: y + 20 }, end: { x: x + 5, y: y + 15 }, thickness: 1.1, color });
  page.drawLine({ start: { x: x + 13, y: y + 20 }, end: { x: x + 13, y: y + 15 }, thickness: 1.1, color });
}

function drawDocumentIcon(page: PDFPage, x: number, y: number, color: ReturnType<typeof rgb>) {
  page.drawRectangle({ x, y, width: 18, height: 24, borderColor: color, borderWidth: 1.1 });
  page.drawLine({ start: { x: x + 4, y: y + 17 }, end: { x: x + 14, y: y + 17 }, thickness: 0.9, color });
  page.drawLine({ start: { x: x + 4, y: y + 12 }, end: { x: x + 14, y: y + 12 }, thickness: 0.9, color });
  page.drawLine({ start: { x: x + 4, y: y + 7 }, end: { x: x + 11, y: y + 7 }, thickness: 0.9, color });
}

function drawPlate(page: PDFPage, plate: string, x: number, y: number, width: number, height: number, fonts: Fonts) {
  drawRoundedRect(page, x, y, width, height, 7, {
    color: rgb(0.94, 0.72, 0.18),
    borderColor: rgb(0.82, 0.61, 0.12),
    borderWidth: 1,
  });
  drawRoundedRect(page, x + 5, y + 6, width - 10, height - 12, 4, {
    borderColor: rgb(0.13, 0.1, 0.04),
    borderWidth: 1,
  });
  const plateSize = Math.min(22, height * 0.42);
  const countrySize = Math.min(8.2, height * 0.16);
  drawCenteredText(page, plate || "-", x + width / 2, y + height * 0.49, width - 24, fonts, { bold: true, size: plateSize, color: COLORS.black });
  drawCenteredText(page, "COLOMBIA", x + width / 2, y + height * 0.29, width - 26, fonts, { bold: true, size: countrySize, color: rgb(0.2, 0.15, 0.05) });
  page.drawLine({ start: { x: x + 12, y: y + 11 }, end: { x: x + 22, y: y + 11 }, thickness: 2, color: COLORS.black });
  page.drawLine({ start: { x: x + width - 22, y: y + 11 }, end: { x: x + width - 12, y: y + 11 }, thickness: 2, color: COLORS.black });
}

async function loadLogoBytes() {
  return fs.readFile(path.join(process.cwd(), "public", "autocheck-logo.png"));
}

async function loadHeaderTemplateBytes() {
  return fs.readFile(path.join(process.cwd(), "public", "certificar-header-template.png"));
}

async function loadDetailIconsBytes() {
  return Promise.all(
    [1, 2, 3, 4, 5, 6].map((index) =>
      fs.readFile(path.join(process.cwd(), "public", `certificar-detail-icon-${index}.png`)),
    ),
  );
}

async function loadWhatsappIconBytes() {
  return fs.readFile(path.join(process.cwd(), "public", "certificar-whatsapp-icon.png"));
}

class CertificarRenderer {
  constructor(
    private readonly doc: PDFDocument,
    private readonly fonts: Fonts,
    private readonly logoBytes: Uint8Array,
    private readonly headerTemplateBytes: Uint8Array,
    private readonly detailIconsBytes: Uint8Array[],
    private readonly whatsappIconBytes: Uint8Array,
    private readonly sourceDoc: PDFDocument,
    private readonly report: CertificarReport,
    private readonly options: Required<Omit<ProcessCertificarPdfOptions, "queryType">>,
  ) {}

  async render() {
    const logo = await this.doc.embedPng(this.logoBytes);
    const headerTemplate = await this.doc.embedPng(this.headerTemplateBytes);
    const detailIcons = await Promise.all(this.detailIconsBytes.map((iconBytes) => this.doc.embedPng(iconBytes)));
    const whatsappIcon = await this.doc.embedPng(this.whatsappIconBytes);
    const pages = this.doc.getPages();
    const sourceQr = await this.embedSourceQr();

    pages.forEach((page, index) => {
      const { width, height } = page.getSize();
      this.maskFooter(page, width);
      this.drawFooter(page, width, FOOTER_HEIGHT, index + 1, pages.length, logo, whatsappIcon, sourceQr);
      if (index === pages.length - 1) {
        this.drawLiabilityNotice(page, width, FOOTER_HEIGHT + 12);
      }

      if (index === 0) {
        this.maskHeader(page, width, height);
        this.drawHeader(page, width, height, headerTemplate, detailIcons);
      }
    });
  }

  private maskHeader(page: PDFPage, width: number, height: number) {
    page.drawRectangle({ x: 0, y: height - HEADER_HEIGHT, width, height: HEADER_HEIGHT, color: COLORS.white });
  }

  private maskFooter(page: PDFPage, width: number) {
    page.drawRectangle({ x: 0, y: 0, width, height: FOOTER_MASK_HEIGHT, color: COLORS.white });
  }

  private async embedSourceQr() {
    return this.doc.embedPage(this.sourceDoc.getPage(0), {
      left: 95,
      bottom: 50,
      right: 130,
      top: 88,
    });
  }

  private drawHeader(
    page: PDFPage,
    width: number,
    height: number,
    headerTemplate: Awaited<ReturnType<PDFDocument["embedPng"]>>,
    detailIcons: PDFImage[],
  ) {
    const y = height - HEADER_HEIGHT;
    const panelTextX = width - 106;

    page.drawImage(headerTemplate, { x: 0, y, width, height: HEADER_HEIGHT });
    const rightPanelX = width - 140;

    // Remove the diagonal blue wedge from the template before drawing dynamic content.
    page.drawRectangle({ x: 390, y, width: rightPanelX - 390, height: HEADER_HEIGHT, color: COLORS.white });

    page.drawRectangle({ x: 212, y: y + 2, width: rightPanelX - 212, height: 65, color: COLORS.white });
    drawPlate(page, this.report.plate, 216, y + 9, 96, 50, this.fonts);

    const detailsX = 342;
    const detailValueX = 384;
    const detailValueWidth = rightPanelX - detailValueX - 8;
    const details = [
      ["MARCA:", this.report.brand],
      ["MODELO:", this.report.model],
      ["AÑO:", this.report.year],
      ["TIPO:", this.report.vehicleType],
      ["COLOR:", this.report.color],
      ["COMBUSTIBLE:", this.report.fuel],
    ];
    details.forEach(([label, value], index) => {
      const rowY = y + 59 - index * 9.2;
      const icon = detailIcons[index];
      const iconHeight = 7.8;
      page.drawImage(icon, {
        x: 330,
        y: rowY - 1,
        width: (icon.width / icon.height) * iconHeight,
        height: iconHeight,
      });
      drawText(page, label, detailsX, rowY, this.fonts, {
        bold: true,
        size: 4.35,
        color: COLORS.blue,
        maxWidth: detailValueX - detailsX - 4,
      });
      drawText(page, value || "No disponible", detailValueX, rowY, this.fonts, {
        size: 4.65,
        color: COLORS.slate,
        maxWidth: detailValueWidth,
      });
    });

    page.drawRectangle({ x: rightPanelX, y, width: width - rightPanelX, height: HEADER_HEIGHT, color: COLORS.darkBlue });
    page.drawRectangle({ x: rightPanelX, y: height - 8, width: width - rightPanelX, height: 5, color: COLORS.midBlue });
    drawDocumentIcon(page, width - 128, y + 66, COLORS.white);
    drawText(page, "INFORME No.", panelTextX, y + 76, this.fonts, { bold: true, size: 6.2, color: COLORS.white });
    drawText(page, formatReportNumber(this.report), panelTextX, y + 61, this.fonts, { size: 8.3, color: COLORS.white, maxWidth: 92 });
    page.drawLine({ start: { x: width - 131, y: y + 52 }, end: { x: width - 14, y: y + 52 }, thickness: 0.5, color: rgb(0.35, 0.56, 0.9) });
    drawCalendarIcon(page, width - 126, y + 29, COLORS.white);
    drawText(page, "FECHA DE CONSULTA:", panelTextX, y + 38, this.fonts, { bold: true, size: 5.1, color: COLORS.white });
    drawText(page, this.report.queryDate || "No disponible", panelTextX, y + 28, this.fonts, { size: 5.4, color: COLORS.white, maxWidth: 92 });
    drawText(page, "TIPO DE CONSULTA:", panelTextX, y + 13, this.fonts, { bold: true, size: 5.1, color: COLORS.white });
    page.drawRectangle({ x: panelTextX, y: y + 2, width: 84, height: 9, color: COLORS.sky });
    drawText(page, this.report.queryType, panelTextX + 5, y + 5, this.fonts, { bold: true, size: 4.45, color: COLORS.white, maxWidth: 74 });
  }

  private drawFooter(
    page: PDFPage,
    width: number,
    height: number,
    pageNumber: number,
    pageCount: number,
    logo: Awaited<ReturnType<PDFDocument["embedPng"]>>,
    whatsappIcon: Awaited<ReturnType<PDFDocument["embedPng"]>>,
    sourceQr: PDFEmbeddedPage,
  ) {
    page.drawRectangle({ x: 0, y: 0, width, height, color: COLORS.white });
    page.drawRectangle({ x: 0, y: height - 8, width, height: 2.5, color: COLORS.darkBlue });
    page.drawRectangle({ x: 0, y: 0, width, height: 12, color: COLORS.darkBlue });
    page.drawRectangle({ x: width - 205, y: 0, width: 190, height: 12, color: COLORS.midBlue });

    page.drawPage(sourceQr, { x: 16, y: 24, width: 44, height: 44 });
    page.drawSvgPath("M 0 0 L 0 12 L 9 6 Z", { x: 63, y: 58, color: COLORS.blue });
    drawText(page, "Verifica la validez", 76, 58, this.fonts, { bold: true, size: 7.2, color: COLORS.blue });
    drawText(page, "de este informe", 76, 47, this.fonts, { bold: true, size: 7.2, color: COLORS.blue });
    drawWrappedText(page, "Escanea el código QR o ingresa a nuestra web", 76, 35, 68, this.fonts, { size: 6.3, color: COLORS.slate, lineHeight: 8, maxLines: 3 });
    page.drawLine({ start: { x: 148, y: 22 }, end: { x: 148, y: 66 }, thickness: 0.4, color: COLORS.border });

    drawIconShield(page, 268, 42, COLORS.blue);
    page.drawImage(logo, { x: 291, y: 44, width: 86, height: (logo.height / logo.width) * 86 });
    page.drawLine({ start: { x: 340, y: 35 }, end: { x: 361, y: 35 }, thickness: 1, color: COLORS.blue });
    if (this.options.addContactNumber) {
      page.drawImage(whatsappIcon, { x: 303, y: 17.5, width: 14, height: (whatsappIcon.height / whatsappIcon.width) * 14 });
      drawText(page, "310 552 3591", 319, 22, this.fonts, { size: 6.8, color: COLORS.slate });
    }

    drawText(page, "CONFIDENCIAL", 392, 58, this.fonts, { bold: true, size: 7.2, color: COLORS.blue });
    drawWrappedText(
      page,
      "Este informe contiene información de carácter confidencial que es propiedad de AutoCheck. Está prohibida su reproducción total o parcial sin autorización expresa.",
      392,
      45,
      110,
      this.fonts,
      { size: 4.25, color: COLORS.slate, lineHeight: 5.4, maxLines: 5 },
    );
    const pageColumnX = width - 74;
    const pageColumnWidth = 44;
    const pageColumnCenter = pageColumnX + pageColumnWidth / 2;

    page.drawRectangle({ x: pageColumnX, y: 50, width: pageColumnWidth, height: 16, color: COLORS.darkBlue });
    drawCenteredText(page, "Página", pageColumnCenter, 55, pageColumnWidth - 8, this.fonts, { bold: true, size: 6, color: COLORS.white });
    drawCenteredText(page, `${pageNumber} de ${pageCount}`, pageColumnCenter, 30, pageColumnWidth + 6, this.fonts, { size: 7.4, color: COLORS.slate });
  }

  private drawLiabilityNotice(page: PDFPage, width: number, y: number) {
    const x = 13;
    const noticeWidth = width - 26;
    const noticeHeight = 90;
    const columnGap = 14;
    const columnWidth = (noticeWidth - 28 - columnGap) / 2;
    const title = "Aviso de Descarga de Responsabilidad — AutoCheck";
    const leftText =
      "La información proporcionada por AutoCheck se obtiene de fuentes publicas y se presenta de forma fidedigna. Esta destinada exclusivamente a profesionales en cumplimiento, gestión de riesgos y prevención de actividades ilícitas, con el objetivo de realizar la debida diligencia en la compra y venta de vehículos usados.";
    const rightText =
      "La finalidad de AutoCheck es contribuir a la prevención, monitoreo y control del lavado de activos y la financiación del terrorismo en el sector automotriz. La verificación se basa en fuentes publicas; la existencia de un registro no implica culpabilidad. AutoCheck no se responsabiliza por la información reflejada. Las decisiones comerciales son responsabilidad exclusiva del usuario.";

    page.drawRectangle({ x: 0, y: y - 8, width, height: noticeHeight + 36, color: COLORS.white });
    page.drawRectangle({ x, y, width: noticeWidth, height: noticeHeight, color: rgb(0.97, 0.97, 0.97) });
    page.drawRectangle({ x, y, width: 3.2, height: noticeHeight, color: rgb(0.24, 0.09, 0.55) });
    drawCenteredText(page, title, x + noticeWidth / 2, y + noticeHeight - 22, noticeWidth - 80, this.fonts, {
      size: 7,
      color: COLORS.slate,
    });
    page.drawLine({
      start: { x: x + 9, y: y + noticeHeight - 31 },
      end: { x: x + noticeWidth - 9, y: y + noticeHeight - 31 },
      thickness: 0.4,
      color: COLORS.border,
    });
    page.drawLine({
      start: { x: x + noticeWidth / 2, y: y + 11 },
      end: { x: x + noticeWidth / 2, y: y + noticeHeight - 38 },
      thickness: 0.4,
      color: COLORS.border,
    });
    drawWrappedText(page, leftText, x + 12, y + noticeHeight - 45, columnWidth, this.fonts, {
      size: 5.2,
      color: COLORS.slate,
      lineHeight: 5.8,
      maxLines: 7,
    });
    drawWrappedText(page, rightText, x + noticeWidth / 2 + columnGap / 2, y + noticeHeight - 45, columnWidth, this.fonts, {
      size: 5.2,
      color: COLORS.slate,
      lineHeight: 5.8,
      maxLines: 7,
    });
  }

}

export async function processCertificarPdf(pdfBytes: Uint8Array, options: ProcessCertificarPdfOptions = {}) {
  if (!isPdf(pdfBytes)) {
    throw new Error(`Invalid PDF input (${pdfBytes.byteLength} bytes)`);
  }

  const report = parseCertificarReport(await extractTokens(pdfBytes));
  report.queryType = `AUTOCHECK ${options.queryType ?? "PREMIUM"}`;
  const doc = await PDFDocument.load(Uint8Array.from(pdfBytes));
  const sourceDoc = await PDFDocument.load(Uint8Array.from(pdfBytes));
  const fonts = {
    regular: await doc.embedFont(StandardFonts.Helvetica),
    bold: await doc.embedFont(StandardFonts.HelveticaBold),
  };
  const logoBytes = await loadLogoBytes();
  const headerTemplateBytes = await loadHeaderTemplateBytes();
  const detailIconsBytes = await loadDetailIconsBytes();
  const whatsappIconBytes = await loadWhatsappIconBytes();
  const renderer = new CertificarRenderer(
    doc,
    fonts,
    logoBytes,
    headerTemplateBytes,
    detailIconsBytes,
    whatsappIconBytes,
    sourceDoc,
    report,
    { addContactNumber: options.addContactNumber ?? true },
  );

  await renderer.render();

  return doc.save();
}

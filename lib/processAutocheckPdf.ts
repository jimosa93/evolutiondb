import fs from "node:fs/promises";
import path from "node:path";

import {
  PDFEmbeddedPage,
  PDFDocument,
  PDFPage,
  PDFFont,
  StandardFonts,
  rgb,
} from "pdf-lib";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";

const A4_WIDTH = 595.28;
const A4_HEIGHT = 841.89;
const PAGE_MARGIN = 28;
const CARD_PADDING = 12;
const FOOTER_HEIGHT = 28;

const COLORS = {
  blue: rgb(0.07, 0.32, 0.68),
  lightBlue: rgb(0.91, 0.95, 1),
  slate: rgb(0.12, 0.16, 0.22),
  muted: rgb(0.42, 0.48, 0.57),
  border: rgb(0.86, 0.9, 0.95),
  panel: rgb(0.98, 0.99, 1),
  green: rgb(0.08, 0.62, 0.28),
  yellow: rgb(0.95, 0.66, 0.12),
  red: rgb(0.83, 0.18, 0.18),
  white: rgb(1, 1, 1),
};

const TECHNICAL_LABELS = [
  "CILINDRAJE",
  "COMBUSTIBLE",
  "PASAJEROS",
  "CARROCERÍA",
  "PESO",
  "POTENCIA (HP)",
  "AIRBAGS",
  "PUERTAS",
  "ORIGEN",
  "IMPORTADO",
  "TRACCIÓN",
  "TRANSMISIÓN",
  "TIPO VEHÍCULO",
  "CATEGORÍA",
  "EJES",
  "FRENOS",
  "TIPO CAJA",
  "DIRECCIÓN",
  "FAROS",
  "AIRE ACOND.",
  "TIPO AIRE",
  "CÁMARA REVERSA",
  "SENSORES",
  "ABS",
  "TAPICERÍA CUERO",
  "VIDRIOS ELÉC.",
  "ESPEJOS ELÉC.",
  "LARGO",
];

const RISK_FACTOR_LABELS = [
  "Siniestralidad",
  "Continuidad de Seguro",
  "Coberturas",
  "Historial de Titularidad",
  "Valor Comercial",
];

const RISK_CATEGORY_LABELS = [
  ...RISK_FACTOR_LABELS,
  "Identificación Vehicular",
];

const NEXT_OPTIONAL_SECTIONS = [
  "Salud Aseguradora",
  "Análisis de Siniestralidad",
  "Historial de Valor Asegurado",
  "Resumen de Riesgos por Categoría",
  "Personas Relacionadas",
];

type PdfTextItem = {
  str: string;
  x: number;
  y: number;
};

type KeyValue = {
  label: string;
  value: string;
};

type RiskFactor = {
  label: string;
  score: number;
  description: string;
};

type RiskCategory = {
  label: string;
  level: string;
  description: string;
  note: string;
};

type ClaimDetail = {
  id: string;
  notice: string;
  date: string;
  insurer: string;
  insuredValue: string;
  status: string;
  reported: string;
  paid: string;
};

type ClaimAnalysis = {
  summary: KeyValue[];
  details: ClaimDetail[];
};

type InsuredValueRow = {
  year: string;
  value: string;
  insurer: string;
  variation: string;
};

type HealthInsurance = {
  summary: KeyValue[];
  continuityIndex: string;
  insurers: string[];
  coverageByYear: string[];
};

type RelatedPerson = {
  group: "current" | "previous";
  kind: string;
  name: string;
  status: string;
  roles: string[];
  period: string;
  policies: string;
  insurer: string;
};

type RelatedPeople = {
  summary: KeyValue[];
  roleCounts: KeyValue[];
  note: string;
  current: RelatedPerson[];
  previous: RelatedPerson[];
};

type ValuationReport = {
  commercial: KeyValue[];
  depreciation: KeyValue[];
  projections: KeyValue[];
};

type InsuranceReport = {
  summary: KeyValue[];
  status: string;
  available: string;
  insuredValue: string;
  coverages: string[];
  note: string;
};

type VehicleReport = {
  plate: string;
  queryDate: string;
  queryType: string;
  sourceName: string;
  vehicle: {
    brand: string;
    reference: string;
    modelYear: string;
    className: string;
    service: string;
    manufacturer: string;
    originCountry: string;
    guide: string;
    code: string;
  };
  technicalSpecs: KeyValue[];
  risk: {
    score: number;
    level: string;
    message: string;
    factors: RiskFactor[];
  };
  valuation: KeyValue[];
  valuationDetail: ValuationReport;
  insurance: KeyValue[];
  insuranceDetail: InsuranceReport;
  riskCategories: RiskCategory[];
  relatedPeople: RelatedPeople;
  healthInsurance: HealthInsurance;
  rawSections: {
    claims: string[];
    insuredValueHistory: string[];
  };
  claimAnalysis: ClaimAnalysis;
  insuredValueHistory: InsuredValueRow[];
  sourceLayout: {
    vehicleHeadingY?: number;
  };
};

type Fonts = {
  regular: PDFFont;
  bold: PDFFont;
};

type TextStyle = {
  font?: PDFFont;
  size?: number;
  color?: ReturnType<typeof rgb>;
  lineHeight?: number;
};

function normalizeText(text: string) {
  return text.replace(/\s+/g, " ").trim();
}

function toWinAnsiSafeText(text: string) {
  return text
    .replace(/[–—]/g, "-")
    .replace(/…/g, "...")
    .replace(/▲/g, "sube")
    .replace(/▼/g, "baja")
    .replace(/[✓✅]/g, "Si")
    .replace(/[✕✖❌]/g, "No")
    .replace(/[^\x09\x0A\x0D\x20-\xFF]/g, "")
    .trim();
}

function isPdf(bytes: Uint8Array) {
  return bytes.byteLength >= 5 && String.fromCharCode(...bytes.slice(0, 4)) === "%PDF";
}

function uniqueKeepOrder(values: string[]) {
  return values.filter((value, index) => values.indexOf(value) === index);
}

function findTokenIndex(tokens: string[], token: string, fromIndex = 0) {
  return tokens.findIndex((value, index) => index >= fromIndex && value === token);
}

function findAnyTokenIndex(tokens: string[], candidates: string[], fromIndex = 0) {
  const indexes = candidates
    .map((candidate) =>
      tokens.findIndex((value, index) =>
        index >= fromIndex && (value === candidate || value.startsWith(`${candidate} (`)),
      ),
    )
    .filter((index) => index >= 0);
  return indexes.length > 0 ? Math.min(...indexes) : -1;
}

function sliceBetween(tokens: string[], start: string, endCandidates: string[]) {
  const startIndex = findTokenIndex(tokens, start);
  if (startIndex < 0) {
    return [];
  }

  const endIndex = findAnyTokenIndex(tokens, endCandidates, startIndex + 1);
  return tokens.slice(startIndex + 1, endIndex >= 0 ? endIndex : undefined);
}

function sliceBetweenPrefix(tokens: string[], startPrefix: string, endCandidates: string[]) {
  const startIndex = tokens.findIndex((value) => value.startsWith(startPrefix));
  if (startIndex < 0) {
    return [];
  }

  const endIndex = findAnyTokenIndex(tokens, endCandidates, startIndex + 1);
  return tokens.slice(startIndex + 1, endIndex >= 0 ? endIndex : undefined);
}

function firstMatchValue(text: string, pattern: RegExp, fallback = "No disponible") {
  return text.match(pattern)?.[0] ?? fallback;
}

function parsePlate(tokens: string[]) {
  const plates = tokens
    .flatMap((token) => token.match(/\b[A-Z]{3}\d{3}\b/g) ?? [])
    .filter((plate) => plate !== "ABC123");

  return plates.at(-1) ?? "No disponible";
}

function normalizeReference(text: string) {
  return normalizeText(text)
    .replace(/\[\s+/g, "[")
    .replace(/\s+\]/g, "]")
    .replace(/\s+CC\b/g, "CC")
    .replace(/\bCX\s+(\d)\b/g, "CX$1");
}

function findLabelValue(tokens: string[], label: string, endLabels: string[]) {
  const index = findTokenIndex(tokens, label);
  if (index < 0) {
    return "";
  }

  const endIndex = findAnyTokenIndex(tokens, endLabels, index + 1);
  return tokens.slice(index + 1, endIndex >= 0 ? endIndex : undefined).join(" ");
}

function collectMoneyAfter(tokens: string[], index: number) {
  const parts: string[] = [];
  let started = false;

  for (const token of tokens.slice(index + 1, index + 10)) {
    if (token === "$") {
      started = true;
      continue;
    }

    if (/^\$\s*[\d.,]+$/.test(token)) {
      started = true;
      parts.push(token.replace("$", "").trim());
      continue;
    }

    if (/^\d+$/.test(token) || token === "." || /^[\d.,]+$/.test(token)) {
      started = true;
      parts.push(token);
      continue;
    }

    if (started) {
      break;
    }
  }

  return parts.length > 0 ? `$ ${parts.join("").replace(/,+/g, ",")}` : "";
}

function collectMoneyBefore(tokens: string[], index: number) {
  const parts: string[] = [];
  let started = false;

  for (let cursor = index - 1; cursor >= 0; cursor -= 1) {
    const token = tokens[cursor];
    if (/^\$\s*[\d.,]+$/.test(token)) {
      parts.unshift(token.replace("$", "").trim());
      started = true;
      break;
    }
    if (token === "$") {
      started = true;
      break;
    }
    if (/^\d+$/.test(token) || token === "." || /^[\d.,]+$/.test(token)) {
      parts.unshift(token);
      started = true;
      continue;
    }
    if (started) {
      break;
    }
  }

  return parts.length > 0 ? `$ ${parts.join("").replace(/,+/g, ",")}` : "";
}

function parseMoney(tokens: string[], label: string) {
  const index = findTokenIndex(tokens, label);
  if (index < 0) {
    return "";
  }

  const money = collectMoneyAfter(tokens, index);
  if (money) {
    return money;
  }

  return tokens.slice(index + 1).find((value) => value.trim()) ?? "";
}

function parseValueAfter(tokens: string[], label: string) {
  const index = findTokenIndex(tokens, label);
  if (index < 0) {
    return "";
  }

  return tokens[index + 1] ?? "";
}

function findEntryValue(entries: KeyValue[], label: string) {
  return entries.find((entry) => entry.label === label)?.value ?? "";
}

function parseValuationReport(entries: KeyValue[]): ValuationReport {
  return {
    commercial: [
      { label: "Valor inicial", value: findEntryValue(entries, "Valor inicial") },
      { label: "Valor actual", value: findEntryValue(entries, "Valor actual") },
    ].filter((entry) => entry.value),
    depreciation: [
      { label: "Pérdida", value: findEntryValue(entries, "Pérdida") },
      { label: "Retención", value: findEntryValue(entries, "Retención") },
      { label: "Monto depr.", value: findEntryValue(entries, "Monto depreciado") },
    ].filter((entry) => entry.value),
    projections: [
      { label: "Edad", value: findEntryValue(entries, "Edad del vehículo") },
      { label: "Depr. anual prom.", value: findEntryValue(entries, "Depreciación anual promedio") },
      { label: "Pérdida/año", value: findEntryValue(entries, "Pérdida anual promedio") },
    ].filter((entry) => entry.value),
  };
}

async function extractPdfTextItems(pdfBytes: Uint8Array) {
  const task = pdfjs.getDocument({ data: Uint8Array.from(pdfBytes) });
  const document = await task.promise;
  const items: PdfTextItem[] = [];

  try {
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      const textContent = await page.getTextContent();

      for (const rawItem of textContent.items) {
        if (!("str" in rawItem) || !rawItem.str.trim()) {
          continue;
        }

        items.push({
          str: normalizeText(rawItem.str),
          x: rawItem.transform[4],
          y: rawItem.transform[5],
        });
      }
    }
  } finally {
    await task.destroy();
  }

  return items;
}

function parseVehicle(section: string[]) {
  if (section.includes("MARCA")) {
    const guideLabel = section.find((value) => value.startsWith("Guía:")) ?? "Guía:";
    const labels = [
      "MARCA",
      "LÍNEA / REFERENCIA",
      "MODELO (AÑO)",
      "COLOR",
      "CLASE",
      "CILINDRAJE",
      "SERVICIO",
      guideLabel,
    ];
    const brand = findLabelValue(section, "MARCA", labels.filter((label) => label !== "MARCA"));
    const reference = normalizeReference(
      findLabelValue(section, "LÍNEA / REFERENCIA", labels.filter((label) => label !== "LÍNEA / REFERENCIA")),
    );
    const modelYear = findLabelValue(section, "MODELO (AÑO)", labels.filter((label) => label !== "MODELO (AÑO)"));
    const className = findLabelValue(section, "CLASE", labels.filter((label) => label !== "CLASE"));
    const serviceIndex = findTokenIndex(section, "SERVICIO");
    const service = serviceIndex >= 0 ? section[serviceIndex + 1] ?? "" : "";
    const guideIndex = section.findIndex((value) => value.startsWith("Guía:"));
    const afterService = serviceIndex >= 0 && guideIndex > serviceIndex
      ? section.slice(serviceIndex + 2, guideIndex)
      : [];

    return {
      brand: brand || "No disponible",
      reference: reference || "No disponible",
      modelYear: modelYear || "No disponible",
      className: className || "No disponible",
      service,
      manufacturer: afterService[0] ?? "No disponible",
      originCountry: afterService[1] ?? "No disponible",
      guide: section.find((value) => value.startsWith("Guía:"))?.replace("Guía:", "").trim() ?? "",
      code: section.find((value) => value.startsWith("Cód."))?.replace("Cód.", "").trim() ?? "",
    };
  }

  const yearIndex = section.findIndex((value) => /^(19|20)\d{2}$/.test(value));
  const brand = section[0] ?? "No disponible";
  const reference = yearIndex > 1 ? section.slice(1, yearIndex).join(" ") : "No disponible";
  const modelYear = yearIndex >= 0 ? section[yearIndex] : "No disponible";
  const className = yearIndex >= 0 ? section[yearIndex + 1] ?? "No disponible" : "No disponible";

  let cursor = yearIndex >= 0 ? yearIndex + 2 : 2;
  let service = "";
  if (/^(PARTICULAR|PÚBLICO|PUBLICO|OFICIAL)$/i.test(section[cursor] ?? "")) {
    service = section[cursor];
    cursor += 1;
  }

  const manufacturer = section[cursor] ?? "No disponible";
  const originCountry = section[cursor + 1] ?? "No disponible";
  const guide = section.find((value) => value.startsWith("Guía:"))?.replace("Guía:", "").trim() ?? "";
  const code = section.find((value) => value.startsWith("Cód."))?.replace("Cód.", "").trim() ?? "";

  return {
    brand,
    reference,
    modelYear,
    className,
    service,
    manufacturer,
    originCountry,
    guide,
    code,
  };
}

function parseTechnicalSpecs(section: string[]) {
  const labels = new Set(TECHNICAL_LABELS);
  const specs: KeyValue[] = [];

  for (let index = 0; index < section.length; index += 1) {
    const label = section[index];
    if (!labels.has(label)) {
      continue;
    }

    const values: string[] = [];
    for (let nextIndex = index + 1; nextIndex < section.length; nextIndex += 1) {
      const value = section[nextIndex];
      if (labels.has(value) || value.startsWith("Datos de ficha técnica") || value.startsWith("Datos según")) {
        break;
      }
      values.push(value);
    }

    specs.push({ label, value: values.join(" ") || "No disponible" });
  }

  return uniqueKeepOrder(specs.map((spec) => `${spec.label}\u0000${spec.value}`)).map((entry) => {
    const [label, value] = entry.split("\u0000");
    return { label, value };
  });
}

function parseRiskFactors(section: string[]) {
  return RISK_FACTOR_LABELS.flatMap((label) => {
    const index = findTokenIndex(section, label);
    if (index < 0) {
      return [];
    }

    const nextLabelIndex = findAnyTokenIndex(section, RISK_FACTOR_LABELS, index + 1);
    const block = section.slice(index + 1, nextLabelIndex >= 0 ? nextLabelIndex : undefined);
    const scoreTokenIndex = block.findIndex((value) => /^\d+\/100$/.test(value));
    const score = scoreTokenIndex >= 0 ? Number(block[scoreTokenIndex].split("/")[0]) : 0;
    const description = block.slice(scoreTokenIndex + 1).join(" ");

    return [{ label, score, description }];
  });
}

function parseRiskCategories(section: string[]) {
  return RISK_CATEGORY_LABELS.flatMap((label) => {
    const index = findTokenIndex(section, label);
    if (index < 0) {
      return [];
    }

    const nextLabelIndex = findAnyTokenIndex(section, RISK_CATEGORY_LABELS, index + 1);
    const block = section.slice(index + 1, nextLabelIndex >= 0 ? nextLabelIndex : undefined);
    const level = block[0] ?? "No disponible";
    const remaining = block.slice(1);
    const splitAt = remaining.findIndex((value) =>
      /^(Historial|Continuidad|Sin seguro|Sin coberturas|Valor estable|Todos los datos|Datos de identificación|Varios cambios)/i.test(value),
    );

    return [
      {
        label,
        level,
        description: (splitAt >= 0 ? remaining.slice(0, splitAt) : remaining).join(" "),
        note: (splitAt >= 0 ? remaining.slice(splitAt) : []).join(" "),
      },
    ];
  });
}

function parsePersonEntries(section: string[], group: RelatedPerson["group"]) {
  const entries: RelatedPerson[] = [];
  const stopLabels = new Set([
    "ACTUALMENTE VINCULADOS",
    "HISTORIAL ANTERIOR",
    "Datos referenciales",
  ]);

  for (let index = 0; index < section.length; index += 1) {
    if (section[index] !== "Persona" && section[index] !== "Empresa") {
      continue;
    }

    const nextIndex = section.findIndex((value, candidateIndex) =>
      candidateIndex > index && (value === "Persona" || value === "Empresa" || stopLabels.has(value)),
    );
    const block = section.slice(index, nextIndex >= 0 ? nextIndex : undefined);
    const roles = block.filter((value) => ["Asegurado", "Tomadore", "Beneficiario", "Empresa"].includes(value));
    const period = block.find((value) => /^\d{4}-\d{4}$/.test(value)) ?? "";
    const policyIndex = block.findIndex((value) => /pólizas/i.test(value));
    const nameEndIndex = block.findIndex((value, valueIndex) =>
      valueIndex > 1 && (value === "✓" || value === "Vigente" || roles.includes(value) || /^\d{4}-\d{4}$/.test(value)),
    );

    entries.push({
      group,
      kind: block[0] ?? "Persona",
      name: block.slice(1, nameEndIndex > 1 ? nameEndIndex : 2).join(" "),
      status: block.includes("Vigente") ? "Vigente" : "",
      roles,
      period,
      policies: policyIndex >= 0
        ? (/^\d+\s+pólizas/i.test(block[policyIndex]) ? block[policyIndex] : `${block[policyIndex - 1] ?? ""} ${block[policyIndex]}`.trim())
        : "",
      insurer: policyIndex >= 0 ? block.slice(policyIndex + 1).filter((value) => value !== "·").join(" ") : "",
    });
  }

  return entries;
}

function parseRelatedPeople(section: string[]): RelatedPeople {
  const numbers = section.filter((value) => /^\d+$/.test(value)).slice(0, 4);
  const summaryLabels = ["Personas", "Vigentes", "Apariciones", "Empresas"];
  const summary = summaryLabels.map((label, index) => ({
    label,
    value: numbers[index] ?? "0",
  }));
  const roleCounts = section
    .filter((value) => /^\d+\s+(Asegurados|Tomadores|Beneficiarios)$/i.test(value))
    .map((value) => {
      const [count, ...label] = value.split(" ");
      return { label: label.join(" "), value: count };
    });
  const note = section.find((value) => value.startsWith("Vinculadas al historial")) ?? "";
  const currentSection = sliceBetween(section, "ACTUALMENTE VINCULADOS", ["HISTORIAL ANTERIOR", "Datos referenciales"]);
  const previousSection = sliceBetween(section, "HISTORIAL ANTERIOR", ["Datos referenciales"]);

  return {
    summary,
    roleCounts,
    note,
    current: parsePersonEntries(currentSection, "current"),
    previous: parsePersonEntries(previousSection, "previous"),
  };
}

function parseHealthInsurance(section: string[]): HealthInsurance {
  if (section.length === 0) {
    return { summary: [], continuityIndex: "", insurers: [], coverageByYear: [] };
  }

  const summary: KeyValue[] = [];
  const policyIndex = findTokenIndex(section, "PÓLIZAS");
  const continuityIndex = findTokenIndex(section, "CONTINUIDAD");
  const durationIndex = findTokenIndex(section, "DURACIÓN PROM.");
  const changeIndex = findTokenIndex(section, "CAMBIOS ASEG.");

  if (policyIndex > 0) summary.push({ label: "Pólizas", value: section[policyIndex - 1] });
  if (continuityIndex > 1) summary.push({ label: "Continuidad", value: `${section[continuityIndex - 2]}${section[continuityIndex - 1]}` });
  if (durationIndex > 1) summary.push({ label: "Duración prom.", value: `${section[durationIndex - 2]} ${section[durationIndex - 1]}`.trim() });
  if (changeIndex > 0) summary.push({ label: "Cambios aseg.", value: section[changeIndex - 1] });

  const insurerIndex = section.findIndex((value) => value.startsWith("ASEGURADORAS"));
  const coverageIndex = findTokenIndex(section, "COBERTURAS POR AÑO");
  const analysisIndex = section.findIndex((value) => value.startsWith("Análisis basado"));
  const continuityTextIndex = findTokenIndex(section, "Índice de Continuidad");

  return {
    summary,
    continuityIndex: continuityTextIndex >= 0 ? section[continuityTextIndex + 1] ?? "" : "",
    insurers: insurerIndex >= 0 && coverageIndex > insurerIndex ? section.slice(insurerIndex + 1, coverageIndex) : [],
    coverageByYear: coverageIndex >= 0 ? section.slice(coverageIndex + 1, analysisIndex >= 0 ? analysisIndex : undefined) : [],
  };
}

function parseInsuranceReport(section: string[]): InsuranceReport {
  if (section.length === 0) {
    return { summary: [], status: "", available: "", insuredValue: "", coverages: [], note: "" };
  }

  const body = section.filter(Boolean);
  const entries: KeyValue[] = [];
  const joined = body.join(" ");
  const statusLabelIndex = findTokenIndex(body, "ESTADO DE PÓLIZA");
  const status = statusLabelIndex > 0 ? body[statusLabelIndex - 1] : body[0] ?? "";
  const availability = statusLabelIndex >= 0 ? body[statusLabelIndex + 1] ?? "" : "";
  const date = joined.match(/\d{2}\s*\/\s*\d{2}\s*\/\s*\d{4}/)?.[0].replace(/\s+/g, "") ??
    joined.match(/\d{2}\s*\/\s*\d{4}/)?.[0].replace(/\s+/g, "") ??
    body.find((value) => /^\d{2}\/\d{2}\/\d{4}$/.test(value)) ??
    body.find((value) => /^\d{2}\/\d{4}$/.test(value)) ??
    "";
  const insurerLabelIndex = findTokenIndex(body, "ASEGURADORA");
  const insurer = insurerLabelIndex > 0
    ? body[insurerLabelIndex - 1]
    : body.find((value, index) => index > 0 && /^[A-ZÁÉÍÓÚÑ0-9 -]{2,}$/.test(value) && !/^(Vigente|Sin póliza|N\/A|NO|ESTADO DE PÓLIZA|VENCIMIENTO)/i.test(value)) ?? "";
  const claimsLabelIndex = findTokenIndex(body, "RECLAMACIONES");
  const claims = claimsLabelIndex > 1 && /reportes?/i.test(body[claimsLabelIndex - 1])
    ? `${body[claimsLabelIndex - 2]} ${body[claimsLabelIndex - 1]}`.trim()
    : claimsLabelIndex > 0
      ? body[claimsLabelIndex - 1]
    : body.find((value) => /reportes?/i.test(value)) ?? "";

  if (status) entries.push({ label: "Estado", value: status });
  if (date) entries.push({ label: "Vencimiento", value: date });
  if (insurer) entries.push({ label: "Aseguradora", value: insurer });
  if (claims) entries.push({ label: "Reclamaciones", value: claims });

  const insuredValueToken = body.find((value) => value.startsWith("V. Asegurado:"));
  const insuredValueIndex = insuredValueToken ? findTokenIndex(body, insuredValueToken) : -1;
  const insuredValue = insuredValueToken
    ? insuredValueToken.replace("V. Asegurado:", "").trim() || collectMoneyAfter(body, insuredValueIndex)
    : "";

  if (insuredValue) entries.push({ label: "Valor asegurado", value: insuredValue });

  const coverageIndex = findTokenIndex(body, "COBERTURAS PÓLIZA VIGENTE");
  const noteIndex = body.findIndex((value) => value.startsWith("Corresponden a última póliza"));
  const coverageStart = insuredValueIndex >= 0 ? insuredValueIndex + 1 : coverageIndex + 1;
  const coverageTokens = coverageIndex >= 0
    ? body.slice(coverageStart, noteIndex >= 0 ? noteIndex : undefined)
    : [];
  const coverages: string[] = [];
  let currentCoverage: string[] = [];

  for (const token of coverageTokens) {
    if (token === "$" || /^[\d.,]+$/.test(token)) {
      continue;
    }

    if (token === "✓") {
      const coverage = currentCoverage
        .filter((value) => value !== "undefined")
        .join(" ")
        .trim();
      if (coverage) coverages.push(coverage);
      currentCoverage = [];
      continue;
    }

    currentCoverage.push(token);
  }

  return {
    summary: entries.length > 0 ? entries : [{ label: "Información", value: body.join(" ") }],
    status,
    available: availability,
    insuredValue,
    coverages: uniqueKeepOrder(coverages),
    note: noteIndex >= 0 ? body[noteIndex] : "",
  };
}

function parseInsurance(section: string[]) {
  return parseInsuranceReport(section).summary;
}

function parseClaimAnalysis(section: string[]): ClaimAnalysis {
  if (section.length === 0) {
    return { summary: [], details: [] };
  }

  const claimedIndex = findTokenIndex(section, "RECLAMADO");
  const paidIndex = findTokenIndex(section, "PAGADO");
  const avgNoticeIndex = findTokenIndex(section, "PROM. AVISO");
  const summary: KeyValue[] = [
    { label: "Siniestros", value: section[0] ?? "0" },
    { label: "Reclamado", value: claimedIndex > 0 ? collectMoneyBefore(section, claimedIndex) : "" },
    { label: "Pagado", value: paidIndex > 0 ? collectMoneyBefore(section, paidIndex) : "" },
    {
      label: "Prom. aviso",
      value: avgNoticeIndex > 1 ? `${section[avgNoticeIndex - 2]}${section[avgNoticeIndex - 1]}` : "",
    },
  ].filter((entry) => entry.value);

  const detailStart = avgNoticeIndex >= 0 ? avgNoticeIndex + 1 : 0;
  const details: ClaimDetail[] = [];

  for (let index = detailStart; index < section.length; index += 1) {
    if (!/^#/.test(section[index])) {
      continue;
    }

    const nextIndex = section.findIndex((value, candidateIndex) => candidateIndex > index && /^#/.test(value));
    const block = section.slice(index, nextIndex >= 0 ? nextIndex : undefined);
    const noticeIndex = block.findIndex((value) => value.startsWith("Aviso:"));
    const insurerIndex = findTokenIndex(block, "Aseguradora:");
    const insuredValueIndex = findTokenIndex(block, "V. Asegurado:");
    const reportedIndex = findTokenIndex(block, "Reportado:");
    const paidDetailIndex = findTokenIndex(block, "Pagado:");
    const status = block.find((value) => /^PPD|^PTD|^PTH|^RC/i.test(value)) ?? "";

    details.push({
      id: block[0],
      notice: noticeIndex >= 0 ? block[noticeIndex].replace("Aviso:", "").trim() : "",
      date: noticeIndex >= 0 ? block[noticeIndex + 1] ?? "" : "",
      insurer: insurerIndex >= 0 ? block[insurerIndex + 1] ?? "" : "",
      insuredValue: insuredValueIndex >= 0 ? collectMoneyAfter(block, insuredValueIndex) : "",
      status,
      reported: reportedIndex >= 0 ? collectMoneyAfter(block, reportedIndex) : "",
      paid: paidDetailIndex >= 0 ? collectMoneyAfter(block, paidDetailIndex) : "",
    });
  }

  return { summary, details };
}

function parseInsuredValueHistory(tokens: string[]): InsuredValueRow[] {
  const rows: InsuredValueRow[] = [];

  for (let index = 0; index < tokens.length; index += 1) {
    if (!/^(19|20)\d{2}$/.test(tokens[index]) || tokens[index + 1] !== "$") {
      continue;
    }

    const year = tokens[index];
    const value = collectMoneyAfter(tokens, index);
    let cursor = index + 2;
    while (cursor < tokens.length && (/^\d+$/.test(tokens[cursor]) || tokens[cursor] === "." || /^[\d.,]+$/.test(tokens[cursor]))) {
      cursor += 1;
    }

    const insurerParts: string[] = [];
    while (
      cursor < tokens.length &&
      !["▲", "▼", "-", "*"].includes(tokens[cursor]) &&
      !/^\d+(\.\d+)?%$/.test(tokens[cursor]) &&
      !/^(19|20)\d{2}$/.test(tokens[cursor])
    ) {
      insurerParts.push(tokens[cursor]);
      cursor += 1;
    }

    let variation = "";
    if (tokens[cursor] === "▲" || tokens[cursor] === "▼") {
      variation = `${tokens[cursor]} ${tokens[cursor + 1] ?? ""}`.trim();
    } else if (tokens[cursor] === "-" || /^\d+(\.\d+)?%$/.test(tokens[cursor] ?? "")) {
      variation = tokens[cursor];
    }

    if (value && insurerParts.length > 0) {
      rows.push({
        year,
        value,
        insurer: insurerParts.join(" "),
        variation,
      });
    }
  }

  return rows.filter((row, index, all) =>
    all.findIndex((candidate) => candidate.year === row.year && candidate.value === row.value && candidate.insurer === row.insurer) === index,
  );
}

function parseReport(
  tokens: string[],
  sourceName: string,
  sourceLayout: VehicleReport["sourceLayout"],
): VehicleReport {
  const joined = tokens.join(" ");
  const vehicleSection = sliceBetween(tokens, "Identificación del Vehículo", ["Ficha Técnica"]);
  const technicalSection = sliceBetween(tokens, "Ficha Técnica", ["Score de Riesgo Vehicular"]);
  const riskSection = sliceBetween(tokens, "Score de Riesgo Vehicular", ["Valoración FASECOLDA"]);
  const valuationSection = sliceBetween(tokens, "Valoración FASECOLDA", ["Seguro Todo Riesgo"]);
  const insuranceSection = sliceBetween(tokens, "Seguro Todo Riesgo", NEXT_OPTIONAL_SECTIONS);
  const healthInsuranceSection = sliceBetween(tokens, "Salud Aseguradora", ["Historial de Valor Asegurado"]);
  const riskCategoriesSection = sliceBetween(tokens, "Resumen de Riesgos por Categoría", ["Personas Relacionadas"]);
  const relatedPeopleSection = sliceBetween(tokens, "Personas Relacionadas", ["Datos referenciales"]);
  const claimsSection = sliceBetweenPrefix(tokens, "Análisis de Siniestralidad", ["Salud Aseguradora", "Historial de Valor Asegurado"]);
  const insuredValueHistorySection = sliceBetween(tokens, "Historial de Valor Asegurado", ["Resumen de Riesgos por Categoría"]);

  const score = Number(tokens.find((value, index) => tokens[index + 1] === "/ 100" && /^\d+$/.test(value)) ?? "0");
  const riskLevel = firstMatchValue(joined, /RIESGO\s+(BAJO|MEDIO|ALTO)/i, "RIESGO NO DISPONIBLE")
    .replace(/^RIESGO\s+/i, "")
    .toUpperCase();
  const valuation = [
    { label: "Valor inicial", value: parseMoney(valuationSection, "Valor Inicial") },
    { label: "Valor actual", value: parseMoney(valuationSection, "Valor Actual") },
    { label: "Pérdida", value: parseValueAfter(valuationSection, "Pérdida") },
    { label: "Retención", value: parseValueAfter(valuationSection, "Retención") },
    { label: "Monto depreciado", value: parseMoney(valuationSection, "Monto Depr.") },
    { label: "Edad del vehículo", value: parseValueAfter(valuationSection, "Edad") },
    { label: "Depreciación anual promedio", value: parseValueAfter(valuationSection, "Depr. anual prom.") },
    { label: "Pérdida anual promedio", value: parseMoney(valuationSection, "Pérdida/año") },
  ].filter((entry) => entry.value);
  const insuranceDetail = parseInsuranceReport(insuranceSection);

  return {
    plate: parsePlate(tokens),
    queryDate: firstMatchValue(
      joined,
      /\d{2}\/\d{2}\/\d{4},\s*\d{2}\s*:\s*\d{2}\s*[ap]\.m\./i,
    ).replace(/\s+:\s+/, ":"),
    queryType: "Histórica Reciente",
    sourceName,
    vehicle: parseVehicle(vehicleSection),
    technicalSpecs: parseTechnicalSpecs(technicalSection),
    risk: {
      score,
      level: riskLevel,
      message: riskSection.find((value) => /historial|considerar/i.test(value)) ?? "",
      factors: parseRiskFactors(riskSection),
    },
    valuation,
    valuationDetail: parseValuationReport(valuation),
    insurance: insuranceDetail.summary,
    insuranceDetail,
    riskCategories: parseRiskCategories(riskCategoriesSection),
    relatedPeople: parseRelatedPeople(relatedPeopleSection),
    healthInsurance: parseHealthInsurance(healthInsuranceSection),
    rawSections: {
      claims: claimsSection.slice(0, 45),
      insuredValueHistory: insuredValueHistorySection.slice(0, 60),
    },
    claimAnalysis: parseClaimAnalysis(claimsSection),
    insuredValueHistory: parseInsuredValueHistory(tokens),
    sourceLayout,
  };
}

function riskColor(value: number | string) {
  if (typeof value === "number") {
    if (value >= 75) return COLORS.green;
    if (value >= 50) return COLORS.yellow;
    return COLORS.red;
  }

  if (/bajo/i.test(value)) return COLORS.green;
  if (/medio/i.test(value)) return COLORS.yellow;
  if (/alto/i.test(value)) return COLORS.red;
  return COLORS.muted;
}

function wrapText(text: string, font: PDFFont, size: number, maxWidth: number) {
  const words = normalizeText(toWinAnsiSafeText(text)).split(" ");
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

  if (current) {
    lines.push(current);
  }

  return lines.length > 0 ? lines : [""];
}

class ReportRenderer {
  private page: PDFPage;
  private y: number;
  private readonly fonts: Fonts;
  private readonly logoBytes: Uint8Array;
  private vehiclePreview?: PDFEmbeddedPage;

  constructor(
    private readonly doc: PDFDocument,
    fonts: Fonts,
    logoBytes: Uint8Array,
    private readonly providerPdfBytes: Uint8Array,
  ) {
    this.fonts = fonts;
    this.logoBytes = logoBytes;
    this.page = this.createPage();
    this.y = A4_HEIGHT - PAGE_MARGIN;
  }

  async render(report: VehicleReport) {
    await this.prepareVehiclePreview(report);

    await this.drawHeader(report);
    this.drawVehicleAndScore(report);
    this.drawSectionTitle("Ficha técnica");
    this.drawKeyValueGrid(report.technicalSpecs, 4);
    this.ensureSpace(150);
    this.drawSectionTitle("Valoración Fasecolda");
    this.drawValuation(report.valuationDetail);
    this.ensureSpace(175);
    this.drawSectionTitle("Seguro todo riesgo");
    this.drawInsurance(report.insuranceDetail);

    if (report.claimAnalysis.summary.length > 0 || report.claimAnalysis.details.length > 0) {
      this.drawSectionTitle("Análisis de siniestralidad");
      this.drawClaimAnalysis(report.claimAnalysis);
    } else if (report.rawSections.claims.length > 0) {
      this.drawSectionTitle("Análisis de siniestralidad");
      this.drawTextCard(report.rawSections.claims.join(" "));
    }

    if (report.healthInsurance.summary.length > 0) {
      this.drawSectionTitle("Salud aseguradora");
      this.drawHealthInsurance(report.healthInsurance);
    }

    if (report.insuredValueHistory.length > 0) {
      this.drawSectionTitle("Historial de valor asegurado");
      this.drawInsuredValueHistory(report.insuredValueHistory);
    } else if (report.rawSections.insuredValueHistory.length > 0) {
      this.drawSectionTitle("Historial de valor asegurado");
      this.drawTextCard(report.rawSections.insuredValueHistory.join(" "));
    }

    if (report.riskCategories.length > 0) {
      this.drawSectionTitle("Riesgos por categoría");
      this.drawRiskCategories(report.riskCategories);
    }

    this.drawSectionTitle("Personas relacionadas");
    this.drawRelatedPeople(report.relatedPeople);

    this.drawFooter();
  }

  private async drawHeader(report: VehicleReport) {
    const logo = await this.doc.embedPng(this.logoBytes);
    const logoWidth = 170;
    const logoHeight = (logo.height / logo.width) * logoWidth;

    this.page.drawImage(logo, {
      x: PAGE_MARGIN,
      y: this.y - logoHeight,
      width: logoWidth,
      height: logoHeight,
    });

    const metaX = 330;
    this.drawLabelValue("Fecha de consulta", report.queryDate, metaX, this.y - 5, 110);
    this.drawLabelValue("Tipo de consulta", report.queryType, metaX + 125, this.y - 5, 110);

    this.y -= 76;
  }

  private drawVehicleAndScore(report: VehicleReport) {
    const cardHeight = 210;
    this.ensureSpace(cardHeight + 15);

    const leftWidth = 335;
    const rightWidth = A4_WIDTH - PAGE_MARGIN * 2 - leftWidth - 12;
    const topY = this.y;

    this.drawCard(PAGE_MARGIN, topY - cardHeight, leftWidth, cardHeight);
    const imageBox = {
      x: PAGE_MARGIN + CARD_PADDING,
      y: topY - 105,
      width: 126,
      height: 85,
    };
    this.drawVehicleImage(imageBox.x, imageBox.y, imageBox.width, imageBox.height, report);

    const detailX = imageBox.x + imageBox.width + 14;
    this.drawSmallCaps("PLACA", detailX, topY - 24);
    this.drawText(report.plate, detailX, topY - 57, {
      font: this.fonts.bold,
      size: 30,
      color: COLORS.slate,
    });
    this.drawText(report.vehicle.brand, detailX, topY - 80, {
      font: this.fonts.bold,
      size: 14,
      color: COLORS.slate,
    });
    this.drawWrappedText(report.vehicle.reference, detailX, topY - 98, leftWidth - imageBox.width - 50, {
      font: this.fonts.bold,
      size: 11,
      color: COLORS.slate,
      lineHeight: 13,
    });

    const summary: KeyValue[] = [
      { label: "Modelo", value: report.vehicle.modelYear },
      { label: "Clase", value: report.vehicle.className },
      { label: "Servicio", value: report.vehicle.service || "No disponible" },
      { label: "Fabricante", value: report.vehicle.manufacturer },
      { label: "País de origen", value: report.vehicle.originCountry },
      { label: "Guía de valores", value: report.vehicle.guide || "No disponible" },
      { label: "Código referencia", value: report.vehicle.code || "No disponible" },
    ];

    this.drawInlinePairs(summary, PAGE_MARGIN + CARD_PADDING, topY - 130, leftWidth - 24, 3);

    const rightX = PAGE_MARGIN + leftWidth + 12;
    this.drawCard(rightX, topY - cardHeight, rightWidth, cardHeight);
    this.drawSectionHeading("Score de riesgo", rightX + CARD_PADDING, topY - 22);
    this.drawScoreGauge(report.risk.score, rightX + CARD_PADDING + 28, topY - 80);
    this.drawText("RIESGO", rightX + 105, topY - 61, {
      font: this.fonts.bold,
      size: 9,
      color: COLORS.slate,
    });
    this.drawText(report.risk.level, rightX + 105, topY - 80, {
      font: this.fonts.bold,
      size: 17,
      color: riskColor(report.risk.level),
    });
    this.drawWrappedText(report.risk.message, rightX + 105, topY - 99, rightWidth - 120, {
      size: 8,
      color: COLORS.slate,
      lineHeight: 11,
    });

    this.drawText("FACTORES QUE COMPONEN EL SCORE", rightX + CARD_PADDING, topY - 142, {
      font: this.fonts.bold,
      size: 6.5,
      color: COLORS.blue,
    });
    this.drawRiskFactors(report.risk.factors, rightX + CARD_PADDING, topY - 157, rightWidth - 24);

    this.y -= cardHeight + 13;
  }

  private drawVehicleImage(
    x: number,
    y: number,
    width: number,
    height: number,
    report: VehicleReport,
  ) {
    this.page.drawRectangle({
      x,
      y,
      width,
      height,
      color: COLORS.panel,
      borderColor: COLORS.border,
      borderWidth: 1,
    });

    if (!this.vehiclePreview) {
      this.drawText(report.vehicle.brand, x + 10, y + height / 2 + 4, {
        font: this.fonts.bold,
        size: 14,
        color: COLORS.slate,
      });
      return;
    }

    this.page.drawPage(this.vehiclePreview, {
      x,
      y,
      width,
      height,
    });
  }

  private async prepareVehiclePreview(report: VehicleReport) {
    try {
      const providerDocument = await PDFDocument.load(Uint8Array.from(this.providerPdfBytes));
      const [firstPage] = providerDocument.getPages();
      if (!firstPage) {
        return;
      }

      const { width, height } = firstPage.getSize();
      const left = Math.min(18, width * 0.03);
      const cropHeight = 130;
      const cropWidth = 205;
      const headingY = report.sourceLayout.vehicleHeadingY;
      const top = headingY ? headingY - 32 : height - height * 0.044;

      this.vehiclePreview = await this.doc.embedPage(firstPage, {
        left,
        bottom: top - cropHeight,
        right: left + cropWidth,
        top,
      });
    } catch (error) {
      console.warn("Could not embed vehicle preview from provider PDF:", error);
    }
  }

  private drawScoreGauge(score: number, centerX: number, centerY: number) {
    const radius = 28;
    const scoreColor = riskColor(score);
    this.page.drawCircle({
      x: centerX,
      y: centerY,
      size: radius,
      color: rgb(0.94, 0.96, 0.98),
    });
    this.page.drawCircle({
      x: centerX,
      y: centerY,
      size: radius * 0.88,
      color: scoreColor,
    });
    this.page.drawCircle({
      x: centerX,
      y: centerY,
      size: radius * 0.72,
      color: COLORS.white,
    });
    this.page.drawText(String(score || "-"), {
      x: centerX - 13,
      y: centerY - 5,
      size: 22,
      font: this.fonts.bold,
      color: COLORS.slate,
    });
    this.page.drawText("/100", {
      x: centerX - 10,
      y: centerY - 18,
      size: 7,
      font: this.fonts.regular,
      color: COLORS.slate,
    });
  }

  private drawRiskFactors(factors: RiskFactor[], x: number, y: number, width: number) {
    let currentY = y;
    for (const factor of factors.slice(0, 5)) {
      this.drawText(factor.label, x, currentY, {
        font: this.fonts.bold,
        size: 6.5,
        color: COLORS.slate,
      });
      this.page.drawRectangle({
        x: x + 76,
        y: currentY + 1,
        width: width - 96,
        height: 3,
        color: rgb(0.9, 0.92, 0.94),
      });
      this.page.drawRectangle({
        x: x + 76,
        y: currentY + 1,
        width: ((width - 96) * factor.score) / 100,
        height: 3,
        color: riskColor(factor.score),
      });
      this.drawText(String(factor.score), x + width - 16, currentY - 1, {
        font: this.fonts.bold,
        size: 6.5,
        color: COLORS.slate,
      });
      currentY -= 11;
    }
  }

  private drawValuation(valuation: ValuationReport) {
    const width = A4_WIDTH - PAGE_MARGIN * 2;
    const height = 112;
    const gap = 10;
    const panelWidth = (width - gap * 2) / 3;
    const panels = [
      {
        title: "Valores comerciales",
        entries: valuation.commercial,
        color: COLORS.blue,
        fill: COLORS.lightBlue,
      },
      {
        title: "Depreciación",
        entries: valuation.depreciation,
        color: COLORS.green,
        fill: rgb(0.94, 1, 0.97),
      },
      {
        title: "Proyecciones",
        entries: valuation.projections,
        color: rgb(0.29, 0.25, 0.83),
        fill: rgb(0.96, 0.97, 1),
      },
    ];

    this.ensureSpace(height);
    const topY = this.y;
    for (const [index, panel] of panels.entries()) {
      const x = PAGE_MARGIN + index * (panelWidth + gap);
      this.page.drawRectangle({
        x,
        y: topY - height,
        width: panelWidth,
        height,
        color: panel.fill,
        borderColor: COLORS.border,
        borderWidth: 1,
      });
      this.drawText(panel.title.toUpperCase(), x + CARD_PADDING, topY - 18, {
        font: this.fonts.bold,
        size: 7.5,
        color: panel.color,
      });

      let rowY = topY - 40;
      for (const entry of panel.entries) {
        this.drawText(entry.label, x + CARD_PADDING, rowY, {
          size: 8,
          color: COLORS.slate,
        });
        const valueColor = /actual/i.test(entry.label)
          ? COLORS.blue
          : /pérdida|depr/i.test(entry.label) && /[1-9]/.test(entry.value)
            ? COLORS.red
            : /retención/i.test(entry.label)
              ? COLORS.green
              : COLORS.slate;
        this.drawWrappedText(entry.value || "No disponible", x + panelWidth - 78, rowY, 66, {
          font: this.fonts.bold,
          size: 8.5,
          color: valueColor,
          lineHeight: 9,
        });
        rowY -= 20;
      }
    }

    this.y -= height + 10;
  }

  private drawInsurance(insurance: InsuranceReport) {
    const width = A4_WIDTH - PAGE_MARGIN * 2;
    const gap = 8;
    const cardWidth = (width - gap * 3) / 4;
    const summary = insurance.summary.filter((entry) => entry.label !== "Valor asegurado").slice(0, 4);
    const summaryHeight = 48;

    this.ensureSpace(170);
    const topY = this.y;
    summary.forEach((entry, index) => {
      const x = PAGE_MARGIN + index * (cardWidth + gap);
      const accent = /estado/i.test(entry.label)
        ? (/vigente|disponible/i.test(entry.value) ? COLORS.green : riskColor(entry.value))
        : /reclamaciones/i.test(entry.label) && /[1-9]/.test(entry.value)
          ? COLORS.yellow
          : COLORS.blue;
      this.page.drawRectangle({
        x,
        y: topY - summaryHeight,
        width: cardWidth,
        height: summaryHeight,
        color: COLORS.white,
        borderColor: accent,
        borderWidth: 0.7,
      });
      this.drawWrappedText(entry.value || "No disponible", x + 8, topY - 20, cardWidth - 16, {
        font: this.fonts.bold,
        size: 12,
        color: accent,
        lineHeight: 12,
      });
      this.drawSmallCaps(entry.label, x + 8, topY - 36, 5.7);
    });

    if (insurance.available) {
      this.drawText(insurance.available, PAGE_MARGIN + 10, topY - 63, {
        font: this.fonts.bold,
        size: 7,
        color: COLORS.green,
      });
    }

    this.y -= summaryHeight + 22;

    const chips = insurance.coverages.length > 0 ? insurance.coverages : ["Coberturas no disponibles"];
    const columns = 3;
    const chipGap = 6;
    const chipWidth = (width - CARD_PADDING * 2 - chipGap * (columns - 1)) / columns;
    const chipRows = Math.ceil(chips.length / columns);
    const coverageHeight = 48 + chipRows * 24 + (insurance.note ? 18 : 0);
    this.ensureSpace(coverageHeight);
    const coverageTopY = this.y;
    this.drawCard(PAGE_MARGIN, coverageTopY - coverageHeight, width, coverageHeight);
    this.drawSmallCaps("Coberturas póliza vigente", PAGE_MARGIN + CARD_PADDING, coverageTopY - 18, 6.5);
    this.drawText(`V. asegurado: ${insurance.insuredValue || "No disponible"}`, PAGE_MARGIN + width - 150, coverageTopY - 18, {
      font: this.fonts.bold,
      size: 8,
      color: COLORS.slate,
    });

    chips.forEach((coverage, index) => {
      const row = Math.floor(index / columns);
      const col = index % columns;
      const x = PAGE_MARGIN + CARD_PADDING + col * (chipWidth + chipGap);
      const y = coverageTopY - 48 - row * 24;
      this.page.drawRectangle({
        x,
        y,
        width: chipWidth,
        height: 18,
        color: rgb(0.93, 1, 0.96),
        borderColor: rgb(0.45, 0.86, 0.64),
        borderWidth: 0.7,
      });
      this.drawWrappedText(coverage, x + 8, y + 5, chipWidth - 24, {
        font: this.fonts.bold,
        size: 7,
        color: rgb(0.06, 0.4, 0.28),
        lineHeight: 8,
      });
      this.drawText("Si", x + chipWidth - 16, y + 5, {
        font: this.fonts.bold,
        size: 7,
        color: COLORS.green,
      });
    });

    if (insurance.note) {
      this.drawWrappedText(insurance.note, PAGE_MARGIN + CARD_PADDING, coverageTopY - coverageHeight + 12, width - 24, {
        size: 7,
        color: COLORS.muted,
        lineHeight: 8,
      });
    }

    this.y -= coverageHeight + 10;
  }

  private drawClaimAnalysis(claimAnalysis: ClaimAnalysis) {
    if (claimAnalysis.summary.length > 0) {
      this.drawKeyValueGrid(claimAnalysis.summary, 4);
    }

    for (const detail of claimAnalysis.details) {
      const width = A4_WIDTH - PAGE_MARGIN * 2;
      const height = 70;
      this.ensureSpace(height);
      this.drawCard(PAGE_MARGIN, this.y - height, width, height);

      this.drawText(detail.id, PAGE_MARGIN + CARD_PADDING, this.y - 18, {
        font: this.fonts.bold,
        size: 8,
        color: COLORS.red,
      });
      this.drawText(detail.notice ? `Aviso: ${detail.notice}` : "", PAGE_MARGIN + width - 95, this.y - 18, {
        font: this.fonts.bold,
        size: 7,
        color: COLORS.blue,
      });
      this.drawText(detail.date, PAGE_MARGIN + width - 52, this.y - 18, {
        size: 7,
        color: COLORS.muted,
      });
      this.drawText(`Aseguradora: ${detail.insurer || "No disponible"}`, PAGE_MARGIN + CARD_PADDING, this.y - 34, {
        font: this.fonts.bold,
        size: 7,
        color: COLORS.slate,
      });
      this.drawText(`V. asegurado: ${detail.insuredValue || "No disponible"}`, PAGE_MARGIN + 160, this.y - 34, {
        font: this.fonts.bold,
        size: 7,
        color: COLORS.slate,
      });
      this.drawText(detail.status || "Estado no disponible", PAGE_MARGIN + CARD_PADDING, this.y - 50, {
        font: this.fonts.bold,
        size: 7,
        color: COLORS.slate,
      });
      this.drawText(`Reportado: ${detail.reported || "No disponible"}`, PAGE_MARGIN + 160, this.y - 50, {
        font: this.fonts.bold,
        size: 7,
        color: COLORS.red,
      });
      this.drawText(`Pagado: ${detail.paid || "No disponible"}`, PAGE_MARGIN + 320, this.y - 50, {
        font: this.fonts.bold,
        size: 7,
        color: COLORS.green,
      });

      this.y -= height + 8;
    }
  }

  private drawInsuredValueHistory(rows: InsuredValueRow[]) {
    const width = A4_WIDTH - PAGE_MARGIN * 2;
    const rowHeight = 18;
    const height = 34 + rows.length * rowHeight;
    this.ensureSpace(height);
    this.drawCard(PAGE_MARGIN, this.y - height, width, height);

    const columns = [
      { label: "Año", x: PAGE_MARGIN + 12, width: 70 },
      { label: "Valor asegurado", x: PAGE_MARGIN + 110, width: 105 },
      { label: "Aseguradora", x: PAGE_MARGIN + 245, width: 140 },
      { label: "Variación", x: PAGE_MARGIN + width - 82, width: 70 },
    ];

    for (const column of columns) {
      this.drawSmallCaps(column.label, column.x, this.y - 16, 6.5);
    }

    let rowY = this.y - 34;
    for (const row of rows.slice(-8)) {
      this.drawText(row.year, columns[0].x, rowY, {
        font: this.fonts.bold,
        size: 7.5,
        color: COLORS.slate,
      });
      this.drawText(row.value, columns[1].x, rowY, {
        font: this.fonts.bold,
        size: 7.5,
        color: COLORS.slate,
      });
      this.drawWrappedText(row.insurer, columns[2].x, rowY, columns[2].width, {
        size: 7,
        color: COLORS.slate,
        lineHeight: 8,
      });
      this.drawText(row.variation || "-", columns[3].x, rowY, {
        font: this.fonts.bold,
        size: 7.5,
        color: row.variation.startsWith("▲") ? COLORS.green : row.variation.startsWith("▼") ? COLORS.red : COLORS.muted,
      });

      rowY -= rowHeight;
    }

    this.y -= height + 10;
  }

  private drawHealthInsurance(healthInsurance: HealthInsurance) {
    this.drawKeyValueGrid(healthInsurance.summary, 4);

    if (healthInsurance.continuityIndex || healthInsurance.insurers.length > 0 || healthInsurance.coverageByYear.length > 0) {
      const width = A4_WIDTH - PAGE_MARGIN * 2;
      const height = 74;
      this.ensureSpace(height);
      this.drawCard(PAGE_MARGIN, this.y - height, width, height);
      this.drawSmallCaps("Índice de continuidad", PAGE_MARGIN + CARD_PADDING, this.y - 16, 6.5);
      this.drawText(healthInsurance.continuityIndex || "No disponible", PAGE_MARGIN + CARD_PADDING, this.y - 31, {
        font: this.fonts.bold,
        size: 8,
        color: COLORS.green,
      });
      this.drawSmallCaps("Aseguradoras", PAGE_MARGIN + 190, this.y - 16, 6.5);
      this.drawWrappedText(healthInsurance.insurers.join(", ") || "No disponible", PAGE_MARGIN + 190, this.y - 31, 155, {
        font: this.fonts.bold,
        size: 8,
        color: COLORS.slate,
        lineHeight: 9,
      });
      this.drawSmallCaps("Coberturas por año", PAGE_MARGIN + 365, this.y - 16, 6.5);
      this.drawWrappedText(healthInsurance.coverageByYear.join(" · ") || "No disponible", PAGE_MARGIN + 365, this.y - 31, 160, {
        font: this.fonts.bold,
        size: 7.5,
        color: COLORS.slate,
        lineHeight: 9,
      });
      this.y -= height + 10;
    }
  }

  private drawRelatedPeople(relatedPeople: RelatedPeople) {
    this.drawKeyValueGrid(relatedPeople.summary, 4);

    if (relatedPeople.roleCounts.length > 0) {
      this.drawKeyValueGrid(relatedPeople.roleCounts, Math.min(3, relatedPeople.roleCounts.length));
    }

    if (relatedPeople.note) {
      this.drawTextCard(relatedPeople.note);
    }

    if (relatedPeople.current.length > 0) {
      this.drawSmallPeopleHeading("Actualmente vinculados", COLORS.green);
      for (const person of relatedPeople.current) {
        this.drawRelatedPersonCard(person, COLORS.green);
      }
    }

    if (relatedPeople.previous.length > 0) {
      this.drawSmallPeopleHeading("Historial anterior", COLORS.muted);
      for (const person of relatedPeople.previous) {
        this.drawRelatedPersonCard(person, COLORS.muted);
      }
    }
  }

  private drawSmallPeopleHeading(label: string, color: ReturnType<typeof rgb>) {
    this.ensureSpace(22);
    this.page.drawCircle({
      x: PAGE_MARGIN + 4,
      y: this.y - 8,
      size: 3,
      color,
    });
    this.drawText(label.toUpperCase(), PAGE_MARGIN + 14, this.y - 11, {
      font: this.fonts.bold,
      size: 8,
      color: COLORS.slate,
    });
    this.y -= 22;
  }

  private drawRelatedPersonCard(person: RelatedPerson, accent: ReturnType<typeof rgb>) {
    const width = A4_WIDTH - PAGE_MARGIN * 2;
    const height = 62;
    this.ensureSpace(height);
    this.drawCard(PAGE_MARGIN, this.y - height, width, height);
    this.page.drawCircle({
      x: PAGE_MARGIN + CARD_PADDING + 10,
      y: this.y - 30,
      size: 14,
      color: rgb(0.93, 0.96, 1),
    });
    this.drawText(person.kind, PAGE_MARGIN + CARD_PADDING - 1, this.y - 33, {
      font: this.fonts.bold,
      size: 7,
      color: COLORS.muted,
    });
    this.drawText(person.name || "No disponible", PAGE_MARGIN + 58, this.y - 21, {
      font: this.fonts.bold,
      size: 10,
      color: COLORS.slate,
    });
    if (person.status) {
      this.drawText(person.status, PAGE_MARGIN + 190, this.y - 21, {
        font: this.fonts.bold,
        size: 8,
        color: accent,
      });
    }

    this.drawWrappedText(
      [
        person.roles.join(", "),
        person.period,
        person.policies,
        person.insurer,
      ].filter(Boolean).join(" · "),
      PAGE_MARGIN + 58,
      this.y - 40,
      width - 72,
      {
        size: 8,
        color: COLORS.slate,
        lineHeight: 9,
      },
    );
    this.y -= height + 8;
  }

  private drawRiskCategories(categories: RiskCategory[]) {
    const gap = 10;
    const colWidth = (A4_WIDTH - PAGE_MARGIN * 2 - gap) / 2;
    let col = 0;
    let startY = this.y;
    let rowHeight = 0;

    for (const category of categories) {
      const x = PAGE_MARGIN + col * (colWidth + gap);
      const lines = [
        ...wrapText(category.description, this.fonts.regular, 7, colWidth - 24),
        ...wrapText(category.note, this.fonts.regular, 7, colWidth - 24),
      ].filter(Boolean);
      const height = Math.max(58, 38 + lines.length * 8);
      if (col === 0) {
        this.ensureSpace(height);
        startY = this.y;
        rowHeight = height;
      }

      this.drawCard(x, startY - height, colWidth, height);
      this.page.drawCircle({
        x: x + 12,
        y: startY - 17,
        size: 4,
        color: riskColor(category.level),
      });
      this.drawText(category.label, x + 22, startY - 20, {
        font: this.fonts.bold,
        size: 8,
        color: COLORS.slate,
      });
      this.drawText(category.level, x + colWidth - 52, startY - 20, {
        font: this.fonts.bold,
        size: 7,
        color: riskColor(category.level),
      });
      this.drawWrappedText(category.description, x + CARD_PADDING, startY - 36, colWidth - 24, {
        size: 7,
        color: COLORS.slate,
        lineHeight: 8,
      });
      if (category.note) {
        this.drawWrappedText(category.note, x + CARD_PADDING, startY - 53, colWidth - 24, {
          size: 6.5,
          color: riskColor(category.level),
          lineHeight: 8,
        });
      }

      if (col === 1) {
        this.y -= rowHeight + 10;
      }
      col = col === 0 ? 1 : 0;
    }

    if (col === 1) {
      this.y -= rowHeight + 10;
    }
  }

  private drawKeyValueGrid(entries: KeyValue[], columns: number) {
    const gap = 8;
    const width = A4_WIDTH - PAGE_MARGIN * 2;
    const colWidth = (width - gap * (columns - 1)) / columns;
    const rowHeight = 42;
    let col = 0;
    let rowY = this.y;

    for (const entry of entries) {
      if (col === 0) {
        this.ensureSpace(rowHeight);
        rowY = this.y;
      }

      const x = PAGE_MARGIN + col * (colWidth + gap);
      this.drawCard(x, rowY - rowHeight, colWidth, rowHeight);
      this.drawSmallCaps(entry.label, x + 9, rowY - 13, 6.5);
      this.drawWrappedText(entry.value || "No disponible", x + 9, rowY - 27, colWidth - 18, {
        font: this.fonts.bold,
        size: 8,
        color: COLORS.slate,
        lineHeight: 9,
      });

      col += 1;
      if (col >= columns) {
        this.y -= rowHeight + gap;
        col = 0;
      }
    }

    if (col !== 0) {
      this.y -= rowHeight + gap;
    }
  }

  private drawInlinePairs(entries: KeyValue[], x: number, y: number, width: number, columns: number) {
    const colWidth = width / columns;
    entries.forEach((entry, index) => {
      const row = Math.floor(index / columns);
      const col = index % columns;
      const itemX = x + col * colWidth;
      const itemY = y - row * 25;
      this.drawSmallCaps(entry.label, itemX, itemY, 6);
      this.drawWrappedText(entry.value, itemX, itemY - 11, colWidth - 6, {
        font: this.fonts.bold,
        size: 7,
        color: COLORS.slate,
        lineHeight: 8,
      });
    });
  }

  private drawTextCard(text: string) {
    const width = A4_WIDTH - PAGE_MARGIN * 2;
    const lines = wrapText(text, this.fonts.regular, 8, width - 24).slice(0, 16);
    const height = 24 + lines.length * 10;
    this.ensureSpace(height);
    this.drawCard(PAGE_MARGIN, this.y - height, width, height);
    this.drawWrappedText(lines.join(" "), PAGE_MARGIN + CARD_PADDING, this.y - 18, width - 24, {
      size: 8,
      color: COLORS.slate,
      lineHeight: 10,
    });
    this.y -= height + 10;
  }

  private drawSectionTitle(title: string) {
    this.ensureSpace(28);
    this.drawSectionHeading(title, PAGE_MARGIN, this.y - 5);
    this.page.drawLine({
      start: { x: PAGE_MARGIN, y: this.y - 13 },
      end: { x: A4_WIDTH - PAGE_MARGIN, y: this.y - 13 },
      thickness: 1.2,
      color: COLORS.blue,
    });
    this.y -= 23;
  }

  private drawSectionHeading(title: string, x: number, y: number) {
    this.drawText(title.toUpperCase(), x, y, {
      font: this.fonts.bold,
      size: 10,
      color: COLORS.blue,
    });
  }

  private drawLabelValue(label: string, value: string, x: number, y: number, width: number) {
    this.drawSmallCaps(label, x, y, 6.5);
    this.drawWrappedText(value || "No disponible", x, y - 12, width, {
      font: this.fonts.bold,
      size: 8,
      color: COLORS.slate,
      lineHeight: 9,
    });
  }

  private drawCard(x: number, y: number, width: number, height: number) {
    this.page.drawRectangle({
      x,
      y,
      width,
      height,
      color: COLORS.white,
      borderColor: COLORS.border,
      borderWidth: 1,
    });
  }

  private drawSmallCaps(text: string, x: number, y: number, size = 7) {
    this.drawText(text.toUpperCase(), x, y, {
      font: this.fonts.bold,
      size,
      color: COLORS.blue,
    });
  }

  private drawText(text: string, x: number, y: number, style: TextStyle = {}) {
    this.page.drawText(toWinAnsiSafeText(text), {
      x,
      y,
      size: style.size ?? 9,
      font: style.font ?? this.fonts.regular,
      color: style.color ?? COLORS.slate,
    });
  }

  private drawWrappedText(text: string, x: number, y: number, width: number, style: TextStyle = {}) {
    const size = style.size ?? 9;
    const lineHeight = style.lineHeight ?? size + 2;
    const font = style.font ?? this.fonts.regular;
    const lines = wrapText(text, font, size, width);

    lines.forEach((line, index) => {
      this.drawText(line, x, y - index * lineHeight, {
        ...style,
        font,
        size,
      });
    });
  }

  private ensureSpace(height: number) {
    if (this.y - height > PAGE_MARGIN + FOOTER_HEIGHT) {
      return;
    }

    this.drawFooter();
    this.page = this.createPage();
    this.y = A4_HEIGHT - PAGE_MARGIN;
  }

  private createPage() {
    const page = this.doc.addPage([A4_WIDTH, A4_HEIGHT]);
    page.drawRectangle({
      x: 0,
      y: 0,
      width: A4_WIDTH,
      height: A4_HEIGHT,
      color: COLORS.white,
    });
    return page;
  }

  private drawFooter() {
    this.page.drawRectangle({
      x: 0,
      y: 0,
      width: A4_WIDTH,
      height: FOOTER_HEIGHT,
      color: COLORS.blue,
    });
    this.drawText(
      "Información obtenida de fuentes oficiales y bases de datos especializadas. Uso exclusivo para evaluación y respaldo profesional.",
      PAGE_MARGIN,
      11,
      {
        size: 7,
        color: COLORS.white,
      },
    );
  }
}

async function loadLogoBytes() {
  const logoPath = path.join(process.cwd(), "public", "autocheck-logo.png");
  return fs.readFile(logoPath);
}

export async function extractAutocheckReport(pdfBytes: Uint8Array, sourceName = "proveedor.pdf") {
  if (!isPdf(pdfBytes)) {
    throw new Error(`Invalid PDF input (${pdfBytes.byteLength} bytes)`);
  }

  const items = await extractPdfTextItems(pdfBytes);
  const tokens = items.map((item) => item.str).filter(Boolean);
  const sourceLayout = {
    vehicleHeadingY: items.find((item) => item.str === "Identificación del Vehículo")?.y,
  };
  return parseReport(tokens, sourceName, sourceLayout);
}

export async function processAutocheckPdf(pdfBytes: Uint8Array, sourceName = "proveedor.pdf") {
  const report = await extractAutocheckReport(pdfBytes, sourceName);
  const pdfDocument = await PDFDocument.create();
  const fonts = {
    regular: await pdfDocument.embedFont(StandardFonts.Helvetica),
    bold: await pdfDocument.embedFont(StandardFonts.HelveticaBold),
  };
  const logoBytes = await loadLogoBytes();
  const renderer = new ReportRenderer(pdfDocument, fonts, logoBytes, pdfBytes);

  await renderer.render(report);

  return pdfDocument.save();
}

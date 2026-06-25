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

const LIABILITY_NOTICE_TITLE = "Aviso de Responsabilidad - AutoCheck";
const LIABILITY_NOTICE_TEXT =
  "La información suministrada por AutoCheck proviene de fuentes públicas y privadas autorizadas, y se presenta de manera informativa para apoyar los procesos de verificación, debida diligencia y gestión de riesgos en la compra y venta de vehículos usados. Los resultados reflejan los registros encontrados en las bases de datos consultadas al momento de la verificación. La existencia de reportes, alertas o antecedentes no constituye prueba de responsabilidad, culpabilidad o irregularidad por parte de las personas o vehículos consultados. AutoCheck no garantiza la exactitud, vigencia o actualización permanente de la información suministrada por terceros y no asume responsabilidad por las decisiones comerciales, financieras o legales que el usuario adopte con base en este informe.";

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

type PdfImageItem = {
  x: number;
  y: number;
  width: number;
  height: number;
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

type ClaimSubDetail = {
  status: string;
  reported: string;
  paid: string;
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
  subclaims: ClaimSubDetail[];
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
  general: RelatedPerson[];
};

type ValuationReport = {
  commercial: KeyValue[];
  depreciation: KeyValue[];
  projections: KeyValue[];
};

type CoverageDetail = {
  label: string;
  covered: boolean;
};

type InsuranceReport = {
  summary: KeyValue[];
  status: string;
  available: string;
  insuredValue: string;
  coverages: string[];
  coverageDetails: CoverageDetail[];
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
    vehiclePreviewAvailable?: boolean;
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

type AutocheckPdfOptions = {
  includeModel2020Notice?: boolean;
  includeContactNumbers?: boolean;
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

function extractRelatedPeopleSection(tokens: string[]) {
  const startIndex = tokens.findIndex((value) =>
    value === "Personas Relacionadas" || value.startsWith("Personas Relacionadas ("),
  );
  if (startIndex < 0) {
    return [];
  }

  const restartIndex = tokens.findIndex((value, index) =>
    index > startIndex && (value === "Básica" || value === "Premium"),
  );

  return tokens.slice(startIndex + 1, restartIndex >= 0 ? restartIndex : undefined);
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

    if (/^-?\d+$/.test(token) || token === "." || /^-?[\d.,]+$/.test(token)) {
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
    if (/^-?\d+$/.test(token) || token === "." || /^-?[\d.,]+$/.test(token)) {
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
    "Términos y Condiciones",
    "Privacidad",
    "Privacidad • Ayuda",
    "Soporte",
    "¡",
    "Operación exitosa",
    "JUAN",
    "Básica",
    "Premium",
  ]);

  for (let index = 0; index < section.length; index += 1) {
    if (section[index] !== "Persona" && section[index] !== "Empresa") {
      continue;
    }

    const nextIndex = section.findIndex((value, candidateIndex) =>
      candidateIndex > index &&
      (
        stopLabels.has(value) ||
        (value === "1" && section[candidateIndex + 1] === "JUAN") ||
        ((value === "Persona" || value === "Empresa") && candidateIndex !== index + 2)
      ),
    );
    const block = section.slice(index, nextIndex >= 0 ? nextIndex : undefined);
    const roles = uniqueKeepOrder(block.filter((value, valueIndex) =>
      valueIndex > 0 && ["Asegurado", "Tomadore", "Beneficiario", "Empresa"].includes(value),
    ));
    const periodIndex = block.findIndex((value) => /^\d{4}(-\d{4})?$/.test(value));
    const period = periodIndex >= 0 ? block[periodIndex] : "";
    const policyIndex = block.findIndex((value) => /pólizas/i.test(value));
    const nameEndIndex = block.findIndex((value, valueIndex) =>
      valueIndex > 1 && (value === "✓" || value === "Vigente" || roles.includes(value) || /^\d{4}(-\d{4})?$/.test(value)),
    );
    const insurerStartIndex = policyIndex >= 0 ? policyIndex + 1 : periodIndex >= 0 ? periodIndex + 1 : -1;

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
      insurer: insurerStartIndex >= 0 ? block.slice(insurerStartIndex).filter((value) => value !== "·").join(" ") : "",
    });

    index = nextIndex >= 0 ? nextIndex - 1 : section.length;
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
  const previousStartIndex = findTokenIndex(section, "HISTORIAL ANTERIOR");
  const previousSection = previousStartIndex >= 0 ? section.slice(previousStartIndex + 1) : [];
  const noteIndex = note ? findTokenIndex(section, note) : -1;
  const generalSection = currentSection.length === 0 && previousSection.length === 0 && noteIndex >= 0
    ? section.slice(noteIndex + 1)
    : [];

  return {
    summary,
    roleCounts,
    note,
    current: parsePersonEntries(currentSection, "current"),
    previous: parsePersonEntries(previousSection, "previous"),
    general: parsePersonEntries(generalSection, "previous"),
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
    return { summary: [], status: "", available: "", insuredValue: "", coverages: [], coverageDetails: [], note: "" };
  }

  const body = section.filter(Boolean);
  const entries: KeyValue[] = [];
  const joined = body.join(" ");
  const statusLabelIndex = findTokenIndex(body, "ESTADO DE PÓLIZA");
  const rawStatus = statusLabelIndex > 0 ? body.slice(0, statusLabelIndex).join(" ") : body[0] ?? "";
  const status = rawStatus
    .replace(/\b(NO)\s*\/\s*(\d{2})\s*\/\s*(\d{2})\s*\/\s*(\d{2})\b/i, "$1 / $2/$3/$4")
    .replace(/\s{2,}/g, " ")
    .trim();
  const availabilityCandidate = statusLabelIndex >= 0 ? body[statusLabelIndex + 1] ?? "" : "";
  const availability = /^(Disponible|Dato orientativo|No disponible)/i.test(availabilityCandidate)
    ? availabilityCandidate
    : "";
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
  const rawClaims = claimsLabelIndex > 1 && /reportes?/i.test(body[claimsLabelIndex - 1])
    ? `${body[claimsLabelIndex - 2]} ${body[claimsLabelIndex - 1]}`.trim()
    : claimsLabelIndex > 0
      ? body[claimsLabelIndex - 1]
    : body.find((value) => /reportes?/i.test(value)) ?? "";
  const claims = normalizeInsuranceClaims(rawClaims);

  if (status) entries.push({ label: "Estado", value: status });
  if (date) entries.push({ label: "Vencimiento", value: date });
  if (insurer) entries.push({ label: "Aseguradora", value: insurer });
  entries.push({ label: "Reclamaciones", value: claims });

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
  const coverageDetails: CoverageDetail[] = [];
  let currentCoverage: string[] = [];

  for (const token of coverageTokens) {
    if (token === "$" || /^[\d.,]+$/.test(token)) {
      continue;
    }

    if (token === "✓" || token === "✗") {
      const coverage = currentCoverage
        .filter((value) => value !== "undefined")
        .join(" ")
        .trim();
      if (coverage) {
        coverageDetails.push({
          label: coverage,
          covered: token === "✓",
        });
      }
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
    coverages: uniqueKeepOrder(coverageDetails.filter((coverage) => coverage.covered).map((coverage) => coverage.label)),
    coverageDetails,
    note: noteIndex >= 0 ? body[noteIndex] : "",
  };
}

function normalizeInsuranceClaims(value: string) {
  const normalized = normalizeText(value);
  if (!normalized || /sin información|no disponible|n\/a/i.test(normalized) || /^0\s+reportes?/i.test(normalized)) {
    return "Sin reclamaciones";
  }

  return normalized;
}

function hasInsuranceClaims(value: string) {
  const match = normalizeText(value).match(/\b(\d+)\s+reportes?\b/i);
  return match ? Number(match[1]) > 0 : !/sin reclamaciones/i.test(value);
}

function parseInsurance(section: string[]) {
  return parseInsuranceReport(section).summary;
}

function isClaimStatusToken(value: string) {
  return /^(OTROS|PPD|PTD|PTH|RC|RC BIENES|RC PERSONAS)\b/i.test(value);
}

function parseClaimSubDetails(block: string[]) {
  const subclaims: ClaimSubDetail[] = [];

  for (let index = 0; index < block.length; index += 1) {
    if (!isClaimStatusToken(block[index])) {
      continue;
    }

    const nextStatusIndex = block.findIndex((value, candidateIndex) =>
      candidateIndex > index && isClaimStatusToken(value),
    );
    const subBlock = block.slice(index, nextStatusIndex >= 0 ? nextStatusIndex : undefined);
    const reportedIndex = findTokenIndex(subBlock, "Reportado:");
    const paidIndex = findTokenIndex(subBlock, "Pagado:");

    subclaims.push({
      status: subBlock[0],
      reported: reportedIndex >= 0 ? collectMoneyAfter(subBlock, reportedIndex) : "",
      paid: paidIndex >= 0 ? collectMoneyAfter(subBlock, paidIndex) : "",
    });

    index = nextStatusIndex >= 0 ? nextStatusIndex - 1 : block.length;
  }

  return subclaims;
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
    const subclaims = parseClaimSubDetails(block);
    const status = subclaims[0]?.status ?? "";

    details.push({
      id: block[0],
      notice: noticeIndex >= 0 ? block[noticeIndex].replace("Aviso:", "").trim() : "",
      date: noticeIndex >= 0 ? block[noticeIndex + 1] ?? "" : "",
      insurer: insurerIndex >= 0 ? block[insurerIndex + 1] ?? "" : "",
      insuredValue: insuredValueIndex >= 0 ? collectMoneyAfter(block, insuredValueIndex) : "",
      status,
      reported: reportedIndex >= 0 ? collectMoneyAfter(block, reportedIndex) : "",
      paid: paidDetailIndex >= 0 ? collectMoneyAfter(block, paidDetailIndex) : "",
      subclaims,
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
  const relatedPeopleSection = extractRelatedPeopleSection(tokens);
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

function multiplyPdfMatrix(left: number[], right: number[]) {
  return [
    left[0] * right[0] + left[2] * right[1],
    left[1] * right[0] + left[3] * right[1],
    left[0] * right[2] + left[2] * right[3],
    left[1] * right[2] + left[3] * right[3],
    left[0] * right[4] + left[2] * right[5] + left[4],
    left[1] * right[4] + left[3] * right[5] + left[5],
  ];
}

async function extractFirstPageImages(pdfBytes: Uint8Array): Promise<PdfImageItem[]> {
  const task = pdfjs.getDocument({ data: Uint8Array.from(pdfBytes) });
  const document = await task.promise;
  const images: PdfImageItem[] = [];

  try {
    const page = await document.getPage(1);
    const operatorList = await page.getOperatorList();
    let currentTransform = [1, 0, 0, 1, 0, 0];
    const transformStack: number[][] = [];

    for (let index = 0; index < operatorList.fnArray.length; index += 1) {
      const operator = operatorList.fnArray[index];
      const args = operatorList.argsArray[index];

      if (operator === pdfjs.OPS.save) {
        transformStack.push([...currentTransform]);
        continue;
      }

      if (operator === pdfjs.OPS.restore) {
        currentTransform = transformStack.pop() ?? [1, 0, 0, 1, 0, 0];
        continue;
      }

      if (operator === pdfjs.OPS.transform) {
        currentTransform = multiplyPdfMatrix(currentTransform, args as number[]);
        continue;
      }

      if (operator === pdfjs.OPS.paintImageXObject) {
        images.push({
          x: currentTransform[4],
          y: currentTransform[5],
          width: Math.hypot(currentTransform[0], currentTransform[1]),
          height: Math.hypot(currentTransform[2], currentTransform[3]),
        });
      }
    }
  } finally {
    await task.destroy();
  }

  return images;
}

function hasVehiclePreviewImage(images: PdfImageItem[], vehicleHeadingY?: number) {
  if (!vehicleHeadingY) {
    return true;
  }

  return images.some((image) =>
    image.x >= 30 &&
    image.x <= 285 &&
    image.y < vehicleHeadingY &&
    image.y > vehicleHeadingY - 280 &&
    image.width >= 120 &&
    image.height >= 90,
  );
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
    private readonly options: AutocheckPdfOptions = {},
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
    this.drawSectionTitle("Ficha técnica", 42);
    this.drawKeyValueGrid(report.technicalSpecs, 4);
    this.drawSectionTitle("Valoración Fasecolda", 112);
    this.drawValuation(report.valuationDetail);
    this.drawSectionTitle("Seguro todo riesgo", 70);
    this.drawInsurance(report.insuranceDetail);

    if (report.claimAnalysis.summary.length > 0 || report.claimAnalysis.details.length > 0) {
      this.drawSectionTitle("Análisis de siniestralidad", 50);
      this.drawClaimAnalysis(report.claimAnalysis);
    } else if (report.rawSections.claims.length > 0) {
      this.drawSectionTitle("Análisis de siniestralidad", 45);
      this.drawTextCard(report.rawSections.claims.join(" "));
    }

    if (report.healthInsurance.summary.length > 0) {
      this.drawSectionTitle("Salud aseguradora", this.getHealthInsuranceHeight(report.healthInsurance));
      this.drawHealthInsurance(report.healthInsurance);
    }

    if (report.insuredValueHistory.length > 0) {
      this.drawSectionTitle("Historial de valor asegurado", this.getInsuredValueHistoryHeight(report.insuredValueHistory));
      this.drawInsuredValueHistory(report.insuredValueHistory);
    } else if (report.rawSections.insuredValueHistory.length > 0) {
      this.drawSectionTitle("Historial de valor asegurado", 45);
      this.drawTextCard(report.rawSections.insuredValueHistory.join(" "));
    }

    if (report.riskCategories.length > 0) {
      this.drawSectionTitle("Riesgos por categoría", 58);
      this.drawRiskCategories(report.riskCategories);
    }

    this.drawSectionTitle("Personas relacionadas", 42);
    this.drawRelatedPeople(report.relatedPeople);

    this.drawLiabilityNotice();

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

    if (this.options.includeContactNumbers) {
      const contactY = this.y - 36;
      const contactPrefix = "Contacto:";
      this.drawText(`${contactPrefix} 310 5523591`, metaX, contactY, {
        font: this.fonts.bold,
        size: 7,
        color: COLORS.slate,
      });
      this.drawText("312 4095620", metaX + this.fonts.bold.widthOfTextAtSize(`${contactPrefix} `, 7), contactY - 8, {
        font: this.fonts.bold,
        size: 7,
        color: COLORS.slate,
      });
    }

    if (this.options.includeModel2020Notice) {
      this.drawWrappedText("Siniestros y reclamaciones 2020 en adelante.", metaX + 125, this.y - 36, 112, {
        font: this.fonts.bold,
        size: 7,
        color: COLORS.slate,
        lineHeight: 8,
      });
    }

    this.y -= this.options.includeContactNumbers || this.options.includeModel2020Notice ? 90 : 76;
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
      this.drawVehiclePlaceholder(x, y, width, height);
      return;
    }

    this.page.drawPage(this.vehiclePreview, {
      x,
      y,
      width,
      height,
    });
  }

  private drawVehiclePlaceholder(x: number, y: number, width: number, height: number) {
    const iconColor = rgb(0.58, 0.63, 0.67);
    const headlightColor = COLORS.white;
    const scale = Math.min(width / 120, height / 78);
    const iconWidth = 120 * scale;
    const iconHeight = 78 * scale;
    const originX = x + (width - iconWidth) / 2;
    const originY = y + (height - iconHeight) / 2;
    const point = (px: number, py: number) => ({
      x: originX + px * scale,
      y: originY + py * scale,
    });

    this.page.drawLine({
      start: point(32, 44),
      end: point(40, 66),
      thickness: 6 * scale,
      color: iconColor,
    });
    this.page.drawLine({
      start: point(40, 66),
      end: point(80, 66),
      thickness: 6 * scale,
      color: iconColor,
    });
    this.page.drawLine({
      start: point(80, 66),
      end: point(88, 44),
      thickness: 6 * scale,
      color: iconColor,
    });
    this.page.drawLine({
      start: point(29, 42),
      end: point(91, 42),
      thickness: 18 * scale,
      color: iconColor,
    });
    this.page.drawLine({
      start: point(35, 50),
      end: point(85, 50),
      thickness: 5 * scale,
      color: iconColor,
    });
    this.page.drawRectangle({
      ...point(28, 16),
      width: 16 * scale,
      height: 28 * scale,
      color: iconColor,
    });
    this.page.drawRectangle({
      ...point(76, 16),
      width: 16 * scale,
      height: 28 * scale,
      color: iconColor,
    });
    this.page.drawRectangle({
      ...point(20, 40),
      width: 18 * scale,
      height: 7 * scale,
      color: headlightColor,
    });
    this.page.drawRectangle({
      ...point(82, 40),
      width: 18 * scale,
      height: 7 * scale,
      color: headlightColor,
    });
    this.page.drawLine({
      start: point(18, 49),
      end: point(29, 48),
      thickness: 7 * scale,
      color: iconColor,
    });
    this.page.drawLine({
      start: point(91, 48),
      end: point(102, 49),
      thickness: 7 * scale,
      color: iconColor,
    });
  }

  private async prepareVehiclePreview(report: VehicleReport) {
    try {
      if (report.sourceLayout.vehiclePreviewAvailable === false) {
        return;
      }

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
    const scoreText = String(score || "-");
    const scoreSize = 22;
    const scoreWidth = this.fonts.bold.widthOfTextAtSize(scoreText, scoreSize);
    this.page.drawText(scoreText, {
      x: centerX - scoreWidth / 2,
      y: centerY - 3,
      size: scoreSize,
      font: this.fonts.bold,
      color: COLORS.slate,
    });
    const denominator = "/100";
    const denominatorSize = 7;
    const denominatorWidth = this.fonts.regular.widthOfTextAtSize(denominator, denominatorSize);
    this.page.drawText(denominator, {
      x: centerX - denominatorWidth / 2,
      y: centerY - 16,
      size: denominatorSize,
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
      const isClaims = /reclamaciones/i.test(entry.label);
      if (isClaims) {
        this.drawClaimsSummaryCard(entry, x, topY, cardWidth, summaryHeight);
        return;
      }

      const hasClaims = isClaims && hasInsuranceClaims(entry.value);
      const accent = /estado/i.test(entry.label)
        ? (/vigente|disponible/i.test(entry.value) ? COLORS.green : riskColor(entry.value))
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
      this.drawAvailabilityBadge(insurance.available, PAGE_MARGIN + 14, topY - 78);
    }

    this.y -= summaryHeight + (insurance.available ? 48 : 24);

    const chips = insurance.coverageDetails.length > 0
      ? insurance.coverageDetails
      : insurance.coverages.map((coverage) => ({ label: coverage, covered: true }));

    if (chips.length === 0) {
      return;
    }

    const columns = 3;
    const chipGap = 6;
    const chipWidth = (width - CARD_PADDING * 2 - chipGap * (columns - 1)) / columns;
    const chipRows = Math.ceil(chips.length / columns);
    const coverageHeight = 48 + chipRows * 24 + (insurance.note ? 18 : 0);
    this.ensureSpace(coverageHeight);
    const coverageTopY = this.y;
    this.drawCard(PAGE_MARGIN, coverageTopY - coverageHeight, width, coverageHeight);
    this.drawSmallCaps("Coberturas póliza vigente", PAGE_MARGIN + CARD_PADDING, coverageTopY - 18, 6.5);
    if (insurance.insuredValue) {
      this.drawText(`V. asegurado: ${insurance.insuredValue}`, PAGE_MARGIN + width - 150, coverageTopY - 18, {
        font: this.fonts.bold,
        size: 8,
        color: COLORS.slate,
      });
    }

    chips.forEach((coverage, index) => {
      const row = Math.floor(index / columns);
      const col = index % columns;
      const x = PAGE_MARGIN + CARD_PADDING + col * (chipWidth + chipGap);
      const y = coverageTopY - 48 - row * 24;
      const fill = coverage.covered ? rgb(0.93, 1, 0.96) : rgb(0.97, 0.98, 0.99);
      const border = coverage.covered ? rgb(0.45, 0.86, 0.64) : COLORS.border;
      const color = coverage.covered ? rgb(0.06, 0.4, 0.28) : COLORS.muted;
      this.page.drawRectangle({
        x,
        y,
        width: chipWidth,
        height: 18,
        color: fill,
        borderColor: border,
        borderWidth: 0.7,
      });
      this.drawWrappedText(coverage.label, x + 8, y + 5, chipWidth - 26, {
        font: this.fonts.bold,
        size: 7,
        color,
        lineHeight: 8,
      });
      this.drawCoverageMark(x + chipWidth - 15, y + 7, coverage.covered);
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

  private drawClaimsSummaryCard(entry: KeyValue, x: number, topY: number, width: number, height: number) {
    const hasClaims = hasInsuranceClaims(entry.value);
    const topFill = hasClaims ? rgb(0.95, 0.49, 0.02) : rgb(0.08, 0.66, 0.21);
    const bottomFill = hasClaims ? rgb(0.95, 0.36, 0.01) : rgb(0.02, 0.52, 0.18);
    const accent = hasClaims ? rgb(0.94, 0.48, 0.02) : COLORS.green;
    const iconCenterX = x + 24;
    const dividerX = x + 46;
    const textX = x + 54;

    this.page.drawRectangle({
      x,
      y: topY - height,
      width,
      height,
      color: bottomFill,
      borderColor: accent,
      borderWidth: 1.6,
    });
    this.page.drawRectangle({
      x: x + 2,
      y: topY - height + 2,
      width: width - 4,
      height: height / 2,
      color: bottomFill,
    });
    this.page.drawRectangle({
      x: x + 2,
      y: topY - height / 2,
      width: width - 4,
      height: height / 2 - 2,
      color: topFill,
    });

    if (hasClaims) {
      this.drawClaimsAlertIcon(iconCenterX, topY - 24, accent);
    } else {
      this.drawClaimsShieldIcon(x + 18, topY - 34);
    }

    this.page.drawLine({
      start: { x: dividerX, y: topY - 38 },
      end: { x: dividerX, y: topY - 10 },
      thickness: 0.8,
      color: COLORS.white,
      opacity: 0.9,
    });

    const valueText = hasClaims ? entry.value : "Sin\nreclamaciones";
    this.drawWrappedText(valueText, textX, topY - 16, width - 64, {
      font: this.fonts.bold,
      size: hasClaims ? 12 : 9,
      color: COLORS.white,
      lineHeight: hasClaims ? 12 : 9.4,
    });
    this.drawSmallCaps(entry.label, textX, topY - 36, 5.2, COLORS.white);
  }

  private drawAvailabilityBadge(label: string, x: number, y: number) {
    const isAvailable = /disponible/i.test(label);
    const textColor = isAvailable ? rgb(0.06, 0.45, 0.28) : rgb(0.72, 0.32, 0.02);
    const borderColor = isAvailable ? rgb(0.45, 0.86, 0.64) : rgb(0.96, 0.74, 0.28);
    const fillColor = isAvailable ? rgb(0.93, 1, 0.96) : rgb(1, 0.98, 0.9);
    const labelWidth = this.fonts.bold.widthOfTextAtSize(label, 7);
    const badgeWidth = Math.max(72, labelWidth + 24);
    const badgeHeight = 18;

    this.page.drawRectangle({
      x,
      y,
      width: badgeWidth,
      height: badgeHeight,
      color: fillColor,
      borderColor,
      borderWidth: 0.7,
    });
    this.page.drawCircle({
      x: x + 9,
      y: y + badgeHeight / 2,
      size: 3,
      color: isAvailable ? COLORS.green : COLORS.yellow,
    });
    this.drawText(label, x + 16, y + 6, {
      font: this.fonts.bold,
      size: 7,
      color: textColor,
    });
  }

  private drawClaimsAlertIcon(centerX: number, centerY: number, color: ReturnType<typeof rgb>) {
    this.page.drawCircle({
      x: centerX,
      y: centerY,
      size: 12,
      color: rgb(1, 0.98, 0.93),
      borderColor: color,
      borderWidth: 0.8,
    });
    this.page.drawCircle({
      x: centerX,
      y: centerY,
      size: 9.5,
      color,
    });
    this.drawText("!", centerX - 1.8, centerY - 5.2, {
      font: this.fonts.bold,
      size: 14,
      color: COLORS.white,
    });
  }

  private drawClaimsShieldIcon(x: number, y: number) {
    const lineColor = COLORS.white;
    this.page.drawLine({
      start: { x: x + 10, y: y + 24 },
      end: { x: x + 22, y: y + 19 },
      thickness: 1.5,
      color: lineColor,
    });
    this.page.drawLine({
      start: { x: x + 22, y: y + 19 },
      end: { x: x + 22, y: y + 9 },
      thickness: 1.5,
      color: lineColor,
    });
    this.page.drawLine({
      start: { x: x + 22, y: y + 9 },
      end: { x: x + 10, y: y },
      thickness: 1.5,
      color: lineColor,
    });
    this.page.drawLine({
      start: { x: x + 10, y: y },
      end: { x: x - 2, y: y + 9 },
      thickness: 1.5,
      color: lineColor,
    });
    this.page.drawLine({
      start: { x: x - 2, y: y + 9 },
      end: { x: x - 2, y: y + 19 },
      thickness: 1.5,
      color: lineColor,
    });
    this.page.drawLine({
      start: { x: x - 2, y: y + 19 },
      end: { x: x + 10, y: y + 24 },
      thickness: 1.5,
      color: lineColor,
    });
    this.page.drawLine({
      start: { x: x + 4, y: y + 12 },
      end: { x: x + 9, y: y + 7 },
      thickness: 2,
      color: lineColor,
    });
    this.page.drawLine({
      start: { x: x + 9, y: y + 7 },
      end: { x: x + 17, y: y + 17 },
      thickness: 2,
      color: lineColor,
    });
  }

  private drawCoverageMark(x: number, y: number, covered: boolean) {
    if (covered) {
      this.page.drawLine({
        start: { x, y: y + 2 },
        end: { x: x + 3, y: y - 1 },
        thickness: 1.4,
        color: COLORS.green,
      });
      this.page.drawLine({
        start: { x: x + 3, y: y - 1 },
        end: { x: x + 8, y: y + 6 },
        thickness: 1.4,
        color: COLORS.green,
      });
      return;
    }

    this.page.drawLine({
      start: { x, y },
      end: { x: x + 7, y: y + 7 },
      thickness: 1.2,
      color: COLORS.muted,
    });
    this.page.drawLine({
      start: { x: x + 7, y },
      end: { x, y: y + 7 },
      thickness: 1.2,
      color: COLORS.muted,
    });
  }

  private drawClaimAnalysis(claimAnalysis: ClaimAnalysis) {
    if (claimAnalysis.summary.length > 0) {
      this.drawKeyValueGrid(claimAnalysis.summary, 4);
    }

    for (const detail of claimAnalysis.details) {
      const width = A4_WIDTH - PAGE_MARGIN * 2;
      const subclaims = detail.subclaims.length > 0
        ? detail.subclaims
        : [{ status: detail.status, reported: detail.reported, paid: detail.paid }];
      const subRowHeight = 30;
      const height = 58 + subclaims.length * subRowHeight;
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

      let subY = this.y - 58;
      for (const subclaim of subclaims) {
        this.page.drawRectangle({
          x: PAGE_MARGIN + CARD_PADDING,
          y: subY - 9,
          width: width - CARD_PADDING * 2,
          height: 24,
          color: COLORS.panel,
          borderColor: COLORS.border,
          borderWidth: 0.6,
        });
        this.drawText(subclaim.status || "Estado no disponible", PAGE_MARGIN + CARD_PADDING + 9, subY + 4, {
          font: this.fonts.bold,
          size: 7,
          color: COLORS.slate,
        });
        this.drawText(`Reportado: ${subclaim.reported || "No disponible"}`, PAGE_MARGIN + 170, subY + 4, {
          font: this.fonts.bold,
          size: 7,
          color: COLORS.red,
        });
        this.drawText(`Pagado: ${subclaim.paid || "No disponible"}`, PAGE_MARGIN + 345, subY + 4, {
          font: this.fonts.bold,
          size: 7,
          color: COLORS.green,
        });
        subY -= subRowHeight;
      }

      this.y -= height + 8;
    }
  }

  private drawInsuredValueHistory(rows: InsuredValueRow[]) {
    const width = A4_WIDTH - PAGE_MARGIN * 2;
    const rowHeight = 18;
    const displayRows = rows.slice(-8);
    const height = this.getInsuredValueHistoryHeight(rows);
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
    for (const row of displayRows) {
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

  private getInsuredValueHistoryHeight(rows: InsuredValueRow[]) {
    const rowHeight = 18;
    return 34 + Math.min(rows.length, 8) * rowHeight;
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

  private getHealthInsuranceHeight(healthInsurance: HealthInsurance) {
    const hasDetails = healthInsurance.continuityIndex || healthInsurance.insurers.length > 0 || healthInsurance.coverageByYear.length > 0;
    return this.getKeyValueGridHeight(healthInsurance.summary, 4) + (hasDetails ? 84 : 0);
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

    if (relatedPeople.general.length > 0) {
      for (const person of relatedPeople.general) {
        this.drawRelatedPersonCard(person, COLORS.muted);
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

  private getKeyValueGridHeight(entries: KeyValue[], columns: number) {
    if (entries.length === 0) {
      return 0;
    }

    const gap = 8;
    const rowHeight = 42;
    return Math.ceil(entries.length / columns) * (rowHeight + gap);
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

  private drawLiabilityNotice() {
    const width = A4_WIDTH - PAGE_MARGIN * 2;
    const textSize = 6.2;
    const lineHeight = 8;
    const lines = wrapText(LIABILITY_NOTICE_TEXT, this.fonts.regular, textSize, width - 24);
    const height = 34 + lines.length * lineHeight;
    const topMargin = 18;

    this.ensureSpace(height + topMargin);
    this.y -= topMargin;
    this.drawCard(PAGE_MARGIN, this.y - height, width, height);
    this.drawText(LIABILITY_NOTICE_TITLE, PAGE_MARGIN + CARD_PADDING, this.y - 14, {
      font: this.fonts.bold,
      size: 7,
      color: COLORS.blue,
    });
    this.drawWrappedText(LIABILITY_NOTICE_TEXT, PAGE_MARGIN + CARD_PADDING, this.y - 28, width - 24, {
      size: textSize,
      color: COLORS.muted,
      lineHeight,
    });
    this.y -= height + 10;
  }

  private drawSectionTitle(title: string, reservedContentHeight = 0) {
    const isNearPageTop = this.y > A4_HEIGHT - PAGE_MARGIN - 12;
    const topMargin = isNearPageTop ? 0 : 14;
    this.ensureSpace(28 + topMargin + reservedContentHeight);
    this.y -= topMargin;
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

  private drawSmallCaps(text: string, x: number, y: number, size = 7, color = COLORS.blue) {
    this.drawText(text.toUpperCase(), x, y, {
      font: this.fonts.bold,
      size,
      color,
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
  const vehicleHeadingY = items.find((item) => item.str === "Identificación del Vehículo")?.y;
  const firstPageImages = await extractFirstPageImages(pdfBytes);
  const sourceLayout = {
    vehicleHeadingY,
    vehiclePreviewAvailable: hasVehiclePreviewImage(firstPageImages, vehicleHeadingY),
  };
  return parseReport(tokens, sourceName, sourceLayout);
}

export async function processAutocheckPdf(
  pdfBytes: Uint8Array,
  sourceName = "proveedor.pdf",
  options: AutocheckPdfOptions = {},
) {
  const report = await extractAutocheckReport(pdfBytes, sourceName);
  const pdfDocument = await PDFDocument.create();
  const fonts = {
    regular: await pdfDocument.embedFont(StandardFonts.Helvetica),
    bold: await pdfDocument.embedFont(StandardFonts.HelveticaBold),
  };
  const logoBytes = await loadLogoBytes();
  const renderer = new ReportRenderer(pdfDocument, fonts, logoBytes, pdfBytes, options);

  await renderer.render(report);

  return pdfDocument.save();
}

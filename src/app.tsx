import React, { useState, useEffect } from "react";
import { addPage, getDesignMetadata, openDesign } from "@canva/design";
import { upload, requestFontSelection } from "@canva/asset";
import { useSelection, useFeatureSupport } from "@canva/app-hooks";
import { CanvaError } from "@canva/error";
import {
  Alert,
  Button,
  Checkbox,
  ColorSelector,
  Slider,
  Grid,
  ImageCard,
  MultilineInput,
  RadioGroup,
  Rows,
  Text,
  TextInput,
  LoadingIndicator,
  Box,
  Tab,
  TabList,
  TabPanel,
  TabPanels,
  Tabs,
} from "@canva/app-ui-kit";
import type { ImageRef, FontRef } from "@canva/asset";

declare const BACKEND_HOST: string;

// ─── Types ────────────────────────────────────────────────────────────────────

type Observation = {
  date: string;
  domain: string;
  note: string;
  score?: number; // 1–4
};

type Student = {
  id: string;
  name: string;
  birthDate: string;
  group: string;
  photoUrl: string;
  observations: Observation[];
};

type Group = {
  id: string;
  name: string;
  studentCount: number;
};

type BackgroundOption = {
  id: string;
  name: string;
  url: string;
};

type TapeOption = {
  id: string;
  name: string;
  url: string;
};

type StudentPhoto = {
  id: number | string;
  url: string;
};

type NiveauOption = {
  id: string;
  name: string;
  color: string;
};

type Template = {
  id: "rapport" | "portfolio" | "groei";
  emoji: string;
  label: string;
  description: string;
};

type AppState =
  | "idle"
  | "generating"
  | "done";

type AppTab = "settings" | "generate" | "support";

type PageExtraTexts = {
  coloredLevelHandsTopText: string;
  coloredLevelHandsBottomText: string;
  studentGraphsTopText: string;
  studentGraphsBottomText: string;
};

type ReportContentOptions = {
  photoPage: boolean;
  extraPhotosPage: boolean;
  extraTextBoxesPage: boolean;
  coloredLevelHands: boolean;
  studentGraphs: boolean;
  selfDrawing: boolean;
  goalDescriptions: boolean;
  goalLevels: boolean;
};

type ReportDateRange = {
  fromDate: string;
  toDate: string;
};

type NiveauHandjeRow = {
  vak: string;
  ontwikkellijn: string;
  niveaukleur: string;
};

type NiveauHandjesResponse = Record<string, NiveauHandjeRow[]>;

type NiveauHandjeRowInput = {
  date?: unknown;
  datum?: unknown;
  vak?: unknown;
  Vak?: unknown;
  subject?: unknown;
  ontwikkellijn?: unknown;
  ontwikkel_lijn?: unknown;
  line?: unknown;
  niveaukleur?: unknown;
  kleur?: unknown;
  color?: unknown;
};

type DoelomschrijvingRow = {
  ontwikkellijn: string;
  doelnaam: string;
  doelomschrijving: string;
  niveaukleur: string;
};

type OntwikkelniveauRow = {
  ontwikkellijn: string;
  doelnaam: string;
  niveaukleur: Record<string, string>;
};

type GroeigrafiekItem = {
  leerlijn_id: number;
  leerlijn: string;
  chart: string; // data:image/png;base64,...
};

// ─── Constants ────────────────────────────────────────────────────────────────

const STORAGE_KEY = "kleuterapp_api_key";
const BACKGROUND_STORAGE_KEY = "kleuterapp_background";
const TAPES_STORAGE_KEY = "kleuterapp_tapes";
const TEACHER_NAME_STORAGE_KEY = "kleuterapp_teacher_name";
const REPORT_TITLE_STORAGE_KEY = "kleuterapp_report_title";
const REPORT_FOOTER_STORAGE_KEY = "kleuterapp_report_footer";
const REPORT_CONTENT_STORAGE_KEY = "kleuterapp_report_content";
const REPORT_FROM_DATE_STORAGE_KEY = "kleuterapp_report_from_date";
const REPORT_TO_DATE_STORAGE_KEY = "kleuterapp_report_to_date";
const HEADING_FONT_STORAGE_KEY = "kleuterapp_heading_font";
const BODY_FONT_STORAGE_KEY = "kleuterapp_body_font";
const STUDENT_PHOTO_REF_MAP_STORAGE_KEY = "kleuterapp_student_photo_ref_map";
const STUDENT_NAME_ID_MAP_STORAGE_KEY = "kleuterapp_student_name_id_map";
const NIVEAU_HAND_REF_MAP_STORAGE_KEY = "kleuterapp_niveau_hand_ref_map";
const CARD_BG_COLOR_STORAGE_KEY = "kleuterapp_card_bg_color";
const CARD_BG_ALPHA_STORAGE_KEY = "kleuterapp_card_bg_alpha";
const DEFAULT_REPORT_TITLE = "Kijk eens wat ik al kan!";
const DEFAULT_REPORT_CONTENT_OPTIONS: ReportContentOptions = {
  photoPage: true,
  extraPhotosPage: false,
  extraTextBoxesPage: false,
  coloredLevelHands: false,
  studentGraphs: false,
  selfDrawing: false,
  goalDescriptions: false,
  goalLevels: false,
};
const PAGE_W = 816;
const POLAROID_PLACEHOLDER_BASE_URL =
  "https://placehold.co/600x600/efefef/5a5a5a.jpg";
const A4_RATIO = 210 / 297;
const PAGE_H = Math.round(PAGE_W / A4_RATIO);
const uploadedBackgrounds = new Map<string, Promise<ImageRef>>();
const uploadedTapes = new Map<string, Promise<ImageRef>>();
const uploadedNiveauHands = new Map<string, Promise<ImageRef>>();
let currentCardBgColor = "#ffffff";

function blendWithWhite(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const t = Math.max(0, Math.min(100, alpha)) / 100;
  const blend = (c: number) => Math.round(255 * (1 - t) + c * t).toString(16).padStart(2, "0");
  return `#${blend(r)}${blend(g)}${blend(b)}`;
}

const niveauHandRefToColor = new Map<string, string>(
  (() => { try { const s = localStorage.getItem(NIVEAU_HAND_REF_MAP_STORAGE_KEY); return s ? JSON.parse(s) as [string, string][] : []; } catch { return []; } })()
);
function saveNiveauHandRefMap() {
  try { localStorage.setItem(NIVEAU_HAND_REF_MAP_STORAGE_KEY, JSON.stringify([...niveauHandRefToColor])); } catch {}
}
const NIVEAU_HANDS_BASE_URL =
  "https://login.mijnkleutergroep.nl/archon-content/plugins/mkg2/assets/rapporten/handjes";

const TEMPLATES: Template[] = [
  {
    id: "rapport",
    emoji: "📄",
    label: "Maatwerkrapport",
    description: "Foto + naam + observaties per domein",
  },
  {
    id: "portfolio",
    emoji: "🖼️",
    label: "Portfolio",
    description: "Grote foto met laatste notitie",
  },
  {
    id: "groei",
    emoji: "📈",
    label: "Groeioverzicht",
    description: "Tabel met scores per domein",
  },
];

const AVAILABLE_TEMPLATES: Template["id"][] = ["rapport"];

function isA4Dimensions(width: number, height: number): boolean {
  const ratio = width / height;
  const tolerance = 0.03;

  return (
    Math.abs(ratio - A4_RATIO) <= tolerance ||
    Math.abs(ratio - 1 / A4_RATIO) <= tolerance
  );
}

function formatDateInputValue(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function createDefaultReportDateRange(): ReportDateRange {
  const today = new Date();
  const sixMonthsAgo = new Date(today);
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

  return {
    fromDate: formatDateInputValue(sixMonthsAgo),
    toDate: formatDateInputValue(today),
  };
}

function getStoredReportDateRange(): ReportDateRange {
  const defaults = createDefaultReportDateRange();
  const storedFromDate = localStorage.getItem(REPORT_FROM_DATE_STORAGE_KEY);
  const storedToDate = localStorage.getItem(REPORT_TO_DATE_STORAGE_KEY);

  return {
    fromDate: storedFromDate || defaults.fromDate,
    toDate: storedToDate || defaults.toDate,
  };
}

function getStoredSelectedFont(storageKey: string): SelectedFont | null {
  const stored = localStorage.getItem(storageKey);
  if (!stored) {
    return null;
  }

  try {
    const parsed = JSON.parse(stored) as SelectedFont;
    if (!parsed || typeof parsed.name !== "string" || !parsed.ref) {
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}

async function getCurrentPageDimensions(): Promise<
  { width: number; height: number } | undefined
> {
  return new Promise((resolve, reject) => {
    openDesign({ type: "current_page" }, async (session) => {
      if (session.page.type !== "absolute") {
        resolve(undefined);
        return;
      }

      resolve(session.page.dimensions);
    }).catch(reject);
  });
}

async function getCurrentPageTitle(): Promise<string | undefined> {
  return new Promise((resolve, reject) => {
    openDesign({ type: "current_page" }, async (session) => {
      const page = session.page as {
        title?: string;
        name?: string;
        pageTitle?: string;
      };
      resolve(page.title ?? page.name ?? page.pageTitle);
    }).catch(reject);
  });
}

// ─── API helpers ──────────────────────────────────────────────────────────────

type ApiAction =
  | "VALIDATE"
  | "GROUPS"
  | "STUDENTS"
  | "BACKGROUNDS"
  | "TAPES"
  | "NIVEAUS"
  | "LEERLINGPHOTOS"
  | "LOGO"
  | "NIVEAUHANDJES"
  | "DOELOMSCHRIJVING"
  | "ONTWIKKELNIVEAUS"
  | "GROEIGRAFIEKEN";

function buildApiUrl(
  action: ApiAction,
  params?: Record<string, string | number>,
) {
  const baseUrl = BACKEND_HOST.replace(/\/+$/, "");
  const apiEntry = baseUrl;
  const searchParams = new URLSearchParams({
    action,
  });

  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      searchParams.set(key, String(value));
    });
  }

  return `${apiEntry}?${searchParams.toString()}`;
}

async function apiFetch(
  action: ApiAction,
  apiKey: string,
  params?: Record<string, string | number>,
) {
  const url = buildApiUrl(action, params);

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (!res.ok) throw new Error(`${res.status}`);
  return res.json();
}

function toUnixTimestamp(date: string, endOfDay = false): number | undefined {
  const match = date.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) {
    return undefined;
  }

  const [, year, month, day] = match;
  const hours = endOfDay ? 23 : 0;
  const minutes = endOfDay ? 59 : 0;
  const seconds = endOfDay ? 59 : 0;

  return Math.floor(
    Date.UTC(
      Number(year),
      Number(month) - 1,
      Number(day),
      hours,
      minutes,
      seconds,
    ) / 1000,
  );
}

function buildDateRangeParams(dateRange: ReportDateRange):
  | Record<string, number>
  | undefined {
  const vanDatum = toUnixTimestamp(dateRange.fromDate);
  const totDatum = toUnixTimestamp(dateRange.toDate, true);

  if (vanDatum == null || totDatum == null) {
    return undefined;
  }

  return {
    van_datum: vanDatum,
    tot_datum: totDatum,
  };
}

function parseNiveauHandDate(value: string): number | undefined {
  const normalized = value.trim();
  const dmyMatch = normalized.match(/^(\d{1,2})-(\d{1,2})-(\d{2}|\d{4})$/);
  if (dmyMatch) {
    const [, dayRaw, monthRaw, yearRaw] = dmyMatch;
    const day = Number(dayRaw);
    const month = Number(monthRaw);
    const year =
      yearRaw.length === 2
        ? Number(yearRaw) >= 70
          ? 1900 + Number(yearRaw)
          : 2000 + Number(yearRaw)
        : Number(yearRaw);

    const timestamp = Date.UTC(year, month - 1, day);
    return Number.isNaN(timestamp) ? undefined : timestamp;
  }

  const isoMatch = normalized.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (isoMatch) {
    const [, yearRaw, monthRaw, dayRaw] = isoMatch;
    const timestamp = Date.UTC(Number(yearRaw), Number(monthRaw) - 1, Number(dayRaw));
    return Number.isNaN(timestamp) ? undefined : timestamp;
  }

  return undefined;
}

function normalizeNiveauHandjesResponse(value: unknown): NiveauHandjesResponse | undefined {
  if (typeof value === "string") {
    try {
      return normalizeNiveauHandjesResponse(JSON.parse(value));
    } catch {
      return undefined;
    }
  }

  if (Array.isArray(value)) {
    // Some backends return a flat array with a date per row instead of a date=>rows map.
    const groupedFromRows = new Map<string, NiveauHandjeRow[]>();
    let sawFlatRows = false;

    for (const item of value) {
      if (!item || typeof item !== "object") {
        continue;
      }

      const typed = item as NiveauHandjeRowInput;
      const dateSource = typed.date ?? typed.datum;
      const date = typeof dateSource === "string" ? dateSource.trim() : "";
      const vakSource = typed.vak ?? typed.Vak ?? typed.subject;
      const vak = typeof vakSource === "string" ? vakSource.trim() : "";
      const ontwikkellijnSource =
        typed.ontwikkellijn ?? typed.ontwikkel_lijn ?? typed.line;
      const ontwikkellijn =
        typeof ontwikkellijnSource === "string" ? ontwikkellijnSource.trim() : "";
      const niveaukleurSource = typed.niveaukleur ?? typed.kleur ?? typed.color;
      const niveaukleur =
        typeof niveaukleurSource === "string"
          ? niveaukleurSource.trim().replace(/^#/, "").toLowerCase()
          : "";

      if (!date || !vak || !ontwikkellijn || !niveaukleur) {
        continue;
      }

      sawFlatRows = true;
      if (!groupedFromRows.has(date)) {
        groupedFromRows.set(date, []);
      }
      groupedFromRows.get(date)!.push({ vak, ontwikkellijn, niveaukleur });
    }

    if (sawFlatRows) {
      return Object.fromEntries(groupedFromRows.entries());
    }

    const mergedEntries: Array<[string, NiveauHandjeRow[]]> = [];

    for (const item of value) {
      const normalizedItem = normalizeNiveauHandjesResponse(item);
      if (!normalizedItem) {
        continue;
      }
      mergedEntries.push(...Object.entries(normalizedItem));
    }

    if (mergedEntries.length === 0) {
      return undefined;
    }

    return Object.fromEntries(mergedEntries);
  }

  if (!value || typeof value !== "object") {
    return undefined;
  }

  const record = value as Record<string, unknown>;
  const normalizedEntries: Array<[string, NiveauHandjeRow[]]> = [];

  for (const [rawDate, rawRows] of Object.entries(record)) {
    const date = rawDate.trim();
    if (!date) {
      continue;
    }

    const rowsSource = Array.isArray(rawRows)
      ? rawRows
      : rawRows && typeof rawRows === "object"
        ? Object.values(rawRows as Record<string, unknown>)
        : [];

    const rows = rowsSource
      .map((item) => {
        if (!item || typeof item !== "object") {
          return undefined;
        }

        const typed = item as NiveauHandjeRowInput;
        const vakSource = typed.vak ?? typed.Vak ?? typed.subject;
        const vak = typeof vakSource === "string" ? vakSource.trim() : "";
        const ontwikkellijnSource =
          typed.ontwikkellijn ?? typed.ontwikkel_lijn ?? typed.line;
        const ontwikkellijn =
          typeof ontwikkellijnSource === "string"
            ? ontwikkellijnSource.trim()
            : "";
        const niveaukleurSource = typed.niveaukleur ?? typed.kleur ?? typed.color;
        const niveaukleur =
          typeof niveaukleurSource === "string"
            ? niveaukleurSource.trim().replace(/^#/, "").toLowerCase()
            : "";

        if (!vak || !ontwikkellijn || !niveaukleur) {
          return undefined;
        }

        return { vak, ontwikkellijn, niveaukleur };
      })
      .filter((row): row is NiveauHandjeRow => Boolean(row));

    normalizedEntries.push([date, rows]);
  }

  if (normalizedEntries.length === 0) {
    return undefined;
  }

  return Object.fromEntries(normalizedEntries);
}

async function fetchBackgrounds(apiKey: string): Promise<BackgroundOption[]> {
  return apiFetch("BACKGROUNDS", apiKey) as Promise<BackgroundOption[]>;
}

async function fetchTapes(apiKey: string): Promise<TapeOption[]> {
  return apiFetch("TAPES", apiKey) as Promise<TapeOption[]>;
}

async function fetchNiveaus(apiKey: string): Promise<NiveauOption[]> {
  return apiFetch("NIVEAUS", apiKey) as Promise<NiveauOption[]>;
}

async function fetchStudentPhotos(
  apiKey: string,
  studentId: string,
): Promise<StudentPhoto[]> {
  return apiFetch("LEERLINGPHOTOS", apiKey, {
    leerling_id: studentId,
  }) as Promise<StudentPhoto[]>;
}

async function fetchStudents(
  apiKey: string,
  groupId?: string,
): Promise<Student[]> {
  const params = groupId ? { group_id: groupId } : undefined;
  return apiFetch("STUDENTS", apiKey, params) as Promise<Student[]>;
}

async function fetchNiveauHandjes(
  apiKey: string,
  studentId: string,
  dateRange: ReportDateRange,
): Promise<NiveauHandjesResponse> {
  const dateParams = buildDateRangeParams(dateRange);

  const tryNormalize = (raw: unknown): NiveauHandjesResponse | undefined => {
    const direct = normalizeNiveauHandjesResponse(raw);
    if (direct) {
      return direct;
    }

    if (raw && typeof raw === "object") {
      const wrapped = raw as Record<string, unknown>;
      const nestedCandidates = [
        wrapped.data,
        wrapped.result,
        wrapped.niveauhandjes,
        wrapped.NIVEAUHANDJES,
        wrapped.payload,
        wrapped.items,
      ];

      for (const candidate of nestedCandidates) {
        const normalized = normalizeNiveauHandjesResponse(candidate);
        if (normalized) {
          return normalized;
        }
      }
    }

    return undefined;
  };

  const requestVariants: Array<Record<string, string | number>> = [];

  if (dateParams) {
    requestVariants.push({
      leerling_id: studentId,
      ...dateParams,
    });
    requestVariants.push({
      leerling_id: studentId,
      vandatum: dateParams.van_datum,
      totdatum: dateParams.tot_datum,
    });
    requestVariants.push({
      leerling_id: studentId,
      vanDatum: dateParams.van_datum,
      totDatum: dateParams.tot_datum,
    });
    requestVariants.push({
      leerling_id: studentId,
    });
  } else {
    requestVariants.push({
      leerling_id: studentId,
    });
  }

  for (let i = 0; i < requestVariants.length; i++) {
    const params = requestVariants[i];
    const raw = await apiFetch("NIVEAUHANDJES", apiKey, params);
    const normalized = tryNormalize(raw);
    if (!normalized) {
      console.warn("[NIVEAUHANDJES] Kon response niet normaliseren", {
        variantIndex: i,
        params,
        rawType: Array.isArray(raw) ? "array" : typeof raw,
        rawKeys: raw && typeof raw === "object" ? Object.keys(raw as Record<string, unknown>) : [],
      });
      continue;
    }

    const hasAtLeastOneRow = Object.values(normalized).some((rows) => rows.length > 0);
    if (hasAtLeastOneRow) {
      console.info("[NIVEAUHANDJES] Normalisatie gelukt", {
        variantIndex: i,
        params,
        dates: Object.keys(normalized),
        totalRows: Object.values(normalized).reduce((sum, rows) => sum + rows.length, 0),
      });
      return normalized;
    }

    console.warn("[NIVEAUHANDJES] Genormaliseerd maar zonder rows", {
      variantIndex: i,
      params,
      dates: Object.keys(normalized),
    });
  }

  console.warn("[NIVEAUHANDJES] Geen data gevonden in alle requestvarianten", {
    requestVariants,
  });

  return {};
}

async function fetchDoelomschrijvingen(
  apiKey: string,
  studentId: string,
  dateRange: ReportDateRange,
): Promise<DoelomschrijvingRow[]> {
  return apiFetch("DOELOMSCHRIJVING", apiKey, {
    leerling_id: studentId,
    ...buildDateRangeParams(dateRange),
  }) as Promise<DoelomschrijvingRow[]>;
}

async function fetchOntwikkelniveaus(
  apiKey: string,
  studentId: string,
  dateRange: ReportDateRange,
): Promise<OntwikkelniveauRow[]> {
  return apiFetch("ONTWIKKELNIVEAUS", apiKey, {
    leerling_id: studentId,
    ...buildDateRangeParams(dateRange),
  }) as Promise<OntwikkelniveauRow[]>;
}

async function fetchGroeigrafieken(
  apiKey: string,
  studentId: string,
  dateRange: ReportDateRange,
): Promise<GroeigrafiekItem[]> {
  const van = toUnixTimestamp(dateRange.fromDate);
  const tot = toUnixTimestamp(dateRange.toDate, true);
  if (van == null || tot == null) return [];
  const result = await apiFetch("GROEIGRAFIEKEN", apiKey, {
    leerling_id: studentId,
    van,
    tot,
  });
  return Array.isArray(result) ? (result as GroeigrafiekItem[]) : [];
}

async function fetchLogoUrl(apiKey: string): Promise<string | undefined> {
  const data = await apiFetch("LOGO", apiKey) as { url?: string };
  return data?.url;
}

const uploadedLogos = new Map<string, Promise<ImageRef>>();

async function uploadLogo(url: string): Promise<ImageRef> {
  const existing = uploadedLogos.get(url);
  if (existing) {
    return existing;
  }

  const { dataUrl, mimeType } = await fetchAsDataUrl(url);
  const uploadPromise = upload({
    type: "image",
    mimeType: mimeType as any,
    url: dataUrl,
    thumbnailUrl: dataUrl,
    aiDisclosure: "none",
  }).then((asset) => asset.ref);

  uploadedLogos.set(url, uploadPromise);
  return uploadPromise;
}

async function resolveImageAspectRatio(url: string): Promise<number | undefined> {
  return new Promise((resolve) => {
    const image = new Image();
    let settled = false;

    const finish = (ratio?: number) => {
      if (settled) return;
      settled = true;
      resolve(ratio);
    };

    image.onload = () => {
      if (image.naturalWidth > 0 && image.naturalHeight > 0) {
        finish(image.naturalWidth / image.naturalHeight);
      } else {
        finish(undefined);
      }
    };
    image.onerror = () => finish(undefined);

    // Fail-safe to avoid hanging if the image host never responds.
    setTimeout(() => finish(undefined), 5000);
    image.src = url;
  });
}

function getStudentPhotoAltText(student: Student): string {
  return `leerling_id:${student.id}|${student.name}`;
}

function extractStudentIdFromSelectionContent(content: unknown): string | undefined {
  if (!content || typeof content !== "object") {
    return undefined;
  }

  const candidate = content as {
    altText?: { text?: string } | string;
  };

  const altText =
    typeof candidate.altText === "string"
      ? candidate.altText
      : candidate.altText?.text;

  if (!altText) {
    return undefined;
  }

  const match = altText.match(/leerling_id:([^|\s]+)/i);
  return match?.[1];
}

function normalizeNiveauColor(color: string): string {
  return color.trim().replace(/^#/, "").toLowerCase();
}

function extractNiveauColorFromSelectionContent(content: unknown): string | undefined {
  if (!content || typeof content !== "object") {
    return undefined;
  }

  const candidate = content as {
    altText?: { text?: string } | string;
    url?: string;
    thumbnailUrl?: string;
  };

  // 1. Probeer altText
  const altText =
    typeof candidate.altText === "string"
      ? candidate.altText
      : candidate.altText?.text;
  if (altText) {
    const match = altText.match(/niveaukleur:([^|\s]+)/i);
    if (match && match[1]) {
      return normalizeNiveauColor(match[1]);
    }
  }

  // 2. Probeer image url (NIVEAU_HANDS_BASE_URL)
  const url = (candidate.url || candidate.thumbnailUrl || "") as string;
  if (url && url.includes("/handjes/")) {
    const m = url.match(/\/handjes\/([a-fA-F0-9]{3,8})\.png/i);
    if (m && m[1]) {
      return normalizeNiveauColor(m[1]);
    }
  }

  const typed = content as { type?: string; name?: string };

  // 3. Probeer type veld
  if (typed.type && typeof typed.type === "string" && typed.type.toLowerCase().includes("handje")) {
    const m = typed.type.match(/niveauhandje-([a-z]+)/i);
    if (m) return normalizeNiveauColor(m[1]);
  }

  // 4. Probeer naam veld
  if (typed.name && typeof typed.name === "string") {
    const m = typed.name.match(/niveauhandje-([a-z]+)/i);
    if (m) return normalizeNiveauColor(m[1]);
  }

  return undefined;
}

function imageRefKeys(ref: unknown): string[] {
  if (!ref) {
    return [];
  }

  const keys = new Set<string>();

  if (typeof ref === "string") {
    keys.add(ref);
    return Array.from(keys);
  }

  if (typeof ref === "object") {
    const candidate = ref as Record<string, unknown>;
    const idLikeFields = [
      "id",
      "assetId",
      "resourceId",
      "uploadId",
      "imageId",
      "mediaId",
    ];

    idLikeFields.forEach((field) => {
      const value = candidate[field];
      if (typeof value === "string" || typeof value === "number") {
        keys.add(`${field}:${String(value)}`);
      }
    });

    const nestedRef = candidate.ref;
    if (typeof nestedRef === "string" || typeof nestedRef === "number") {
      keys.add(`ref:${String(nestedRef)}`);
    }
  }

  try {
    keys.add(JSON.stringify(ref));
  } catch {
    // Ignore non-serializable refs.
  }

  return Array.from(keys);
}

// ─── Page generation ──────────────────────────────────────────────────────────

async function fetchAsDataUrl(url: string): Promise<{ dataUrl: string; mimeType: string }> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Kon afbeelding niet ophalen (HTTP ${response.status})`);
  }
  const blob = await response.blob();
  const mimeType = blob.type || "image/jpeg";
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("Kon afbeelding niet verwerken"));
    reader.readAsDataURL(blob);
  });
  return { dataUrl, mimeType };
}

async function resolveImageDimensions(url: string): Promise<{
  width: number;
  height: number;
}> {
  return new Promise((resolve, reject) => {
    const image = new Image();

    image.onload = () => {
      if (image.naturalWidth > 0 && image.naturalHeight > 0) {
        resolve({
          width: image.naturalWidth,
          height: image.naturalHeight,
        });
        return;
      }

      reject(new Error("Kon achtergrondafmetingen niet bepalen"));
    };

    image.onerror = () => reject(new Error("Kon achtergrondafbeelding niet laden"));
    image.src = url;
  });
}

async function uploadPhoto(url: string): Promise<ImageRef> {
  const { dataUrl, mimeType } = await fetchAsDataUrl(url);
  const asset = await upload({
    type: "image",
    mimeType: mimeType as any,
    url: dataUrl,
    thumbnailUrl: dataUrl,
    aiDisclosure: "none",
  });
  return asset.ref;
}

async function uploadBackground(url: string): Promise<ImageRef> {
  const existing = uploadedBackgrounds.get(url);
  if (existing) {
    return existing;
  }

  const { width, height } = await resolveImageDimensions(url);
  const mimeType = url.toLowerCase().endsWith(".png") ? "image/png" : "image/jpeg";

  const uploadPromise = upload({
    type: "image",
    mimeType,
    url,
    thumbnailUrl: url,
    width,
    height,
    aiDisclosure: "none",
  }).then((asset) => asset.ref);

  uploadedBackgrounds.set(url, uploadPromise);
  return uploadPromise;
}

async function uploadTape(url: string): Promise<ImageRef> {
  const existing = uploadedTapes.get(url);
  if (existing) {
    return existing;
  }

  const uploadPromise = upload({
    type: "image",
    mimeType: "image/png",
    url,
    thumbnailUrl: url,
    aiDisclosure: "none",
  }).then((asset) => asset.ref);

  uploadedTapes.set(url, uploadPromise);
  return uploadPromise;
}

function buildNiveauHandImageUrl(niveaukleur: string): string {
  const normalized = niveaukleur.trim().replace(/^#/, "").toLowerCase();
  return `${NIVEAU_HANDS_BASE_URL}/${normalized}.png`;
}

async function uploadNiveauHand(url: string): Promise<ImageRef> {
  const existing = uploadedNiveauHands.get(url);
  if (existing) {
    return existing;
  }

  const colorMatch = url.match(/\/handjes\/([^.]+)\.png/i);
  const uploadPromise = upload({
    type: "image",
    mimeType: "image/png",
    url,
    thumbnailUrl: url,
    aiDisclosure: "none",
  }).then((asset) => {
    if (colorMatch) {
      try { niveauHandRefToColor.set(JSON.stringify(asset.ref), colorMatch[1] ?? ""); saveNiveauHandRefMap(); } catch {}
    }
    return asset.ref;
  });

  uploadedNiveauHands.set(url, uploadPromise);
  return uploadPromise;
}

function buildStudentPlaceholderUrl(studentId: string): string {
  return `${POLAROID_PLACEHOLDER_BASE_URL}?text=${encodeURIComponent(`Foto leerling ${studentId}`)}`;
}

function createRectangleShape(
  top: number,
  left: number,
  width: number,
  height: number,
  color: string,
) {
  return {
    type: "shape" as const,
    top,
    left,
    width,
    height,
    paths: [
      {
        d: `M 0 0 H ${width} V ${height} H 0 Z`,
        fill: {
          dropTarget: false,
          color,
        },
      },
    ],
    viewBox: {
      width,
      height,
      top: 0,
      left: 0,
    },
  };
}

async function buildPolaroidElements(
  student: Student,
  selectedTapes: TapeOption[],
  placeholderRef: ImageRef,
  bodyFont: SelectedFont | null = null,
) {
  const polaroidWidth = 320;
  const polaroidHeight = 290;
  const startLeft = 52;
  const startTop = 330;
  const columnGap = 48;
  const rowGap = 44;
  const imageInset = 18;
  const imageTopInset = 18;
  const captionHeight = 122;
  const tapeWidth = 132;
  const tapeHeight = 36;

  const elements: any[] = [];

  for (let index = 0; index < 4; index++) {
    const row = Math.floor(index / 2);
    const col = index % 2;
    const left = startLeft + col * (polaroidWidth + columnGap);
    const top = startTop + row * (polaroidHeight + rowGap);

    elements.push(
      createRectangleShape(top + 5, left + 5, polaroidWidth, polaroidHeight, "#d9d9d9"),
      createRectangleShape(top, left, polaroidWidth, polaroidHeight, currentCardBgColor),
      {
        type: "image",
        ref: placeholderRef,
        top: top + imageTopInset,
        left: left + imageInset,
        width: polaroidWidth - imageInset * 2,
        height: polaroidHeight - imageTopInset - captionHeight,
        altText: {
          text: getStudentPhotoAltText(student),
          decorative: false,
        },
      },
      {
        type: "text",
        top: top + polaroidHeight - captionHeight + 10,
        left: left + imageInset,
        width: polaroidWidth - imageInset * 2,
        children: [
          "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Maecenas nulla massa, scelerisque vitae commodo et, ultrices vel lorem.",
        ],
        textAlign: "center",
        ...fontProps(bodyFont),
      },
    );

    if (selectedTapes.length > 0) {
      const randomTape =
        selectedTapes[Math.floor(Math.random() * selectedTapes.length)];
      const tapeRef = await uploadTape(randomTape.url);

      elements.push({
        type: "image",
        ref: tapeRef,
        top: top - 16,
        left: left + polaroidWidth / 2 - tapeWidth / 2,
        width: tapeWidth,
        height: tapeHeight,
        altText: {
          text: `tape:${randomTape.id}`,
          decorative: true,
        },
      });
    }
  }

  return elements;
}

async function buildExtraPolaroidPageElements(
  student: Student,
  selectedTapes: TapeOption[],
  withPhoto: boolean,
  placeholderRef?: ImageRef,
  bodyFont: SelectedFont | null = null,
) {
  const polaroidWidth = 320;
  const polaroidHeight = withPhoto ? 290 : 240;
  const startLeft = 52;
  const startTop = 72;
  const columnGap = 48;
  const rowGap = 52;
  const imageInset = 18;
  const imageTopInset = 18;
  const captionHeight = withPhoto ? 122 : 164;
  const tapeWidth = 132;
  const tapeHeight = 36;

  const elements: any[] = [];

  for (let index = 0; index < 6; index++) {
    const row = Math.floor(index / 2);
    const col = index % 2;
    const left = startLeft + col * (polaroidWidth + columnGap);
    const top = startTop + row * (polaroidHeight + rowGap);

    elements.push(
      createRectangleShape(top + 5, left + 5, polaroidWidth, polaroidHeight, "#d9d9d9"),
      createRectangleShape(top, left, polaroidWidth, polaroidHeight, currentCardBgColor),
    );

    if (placeholderRef) {
      elements.push({
        type: "image",
        ref: placeholderRef,
        top: top + imageTopInset,
        left: left + imageInset,
        width: polaroidWidth - imageInset * 2,
        height: polaroidHeight - imageTopInset - captionHeight,
        altText: {
          text: getStudentPhotoAltText(student),
          decorative: false,
        },
      });
    }

    elements.push({
      type: "text",
      top: top + polaroidHeight - captionHeight + 10,
      left: left + imageInset,
      width: polaroidWidth - imageInset * 2,
      children: withPhoto
        ? [
            "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Maecenas nulla massa, scelerisque vitae commodo et, ultrices vel lorem.",
          ]
        : ["Typ hier je tekst..."],
      textAlign: "center",
      ...fontProps(bodyFont),
    });

    if (selectedTapes.length > 0) {
      const randomTape =
        selectedTapes[Math.floor(Math.random() * selectedTapes.length)];
      const tapeRef = await uploadTape(randomTape.url);

      elements.push({
        type: "image",
        ref: tapeRef,
        top: top - 16,
        left: left + polaroidWidth / 2 - tapeWidth / 2,
        width: tapeWidth,
        height: tapeHeight,
        altText: {
          text: `tape:${randomTape.id}`,
          decorative: true,
        },
      });
    }
  }

  return elements;
}

async function generateExtraPolaroidPage(
  student: Student,
  selectedTapes: TapeOption[],
  withPhoto: boolean,
  selectedBackground?: BackgroundOption,
  bodyFont: SelectedFont | null = null,
): Promise<ImageRef | undefined> {
  const background = await createPageBackground(selectedBackground);
  const placeholderRef = withPhoto
    ? await uploadPhoto(buildStudentPlaceholderUrl(student.id))
    : undefined;
  const elements = await buildExtraPolaroidPageElements(
    student,
    selectedTapes,
    withPhoto,
    placeholderRef,
    bodyFont,
  );

  await addPageWithRetry({
    title: student.name,
    background,
    elements: [
      ...elements,
      ...buildPageFooterElements(student.name),
    ],
  });

  return placeholderRef;
}

async function generateSelfDrawingPage(
  student: Student,
  selectedBackground?: BackgroundOption,
) {
  const background = await createPageBackground(selectedBackground);
  const margin = Math.round(PAGE_W * (15 / 210));
  const panelWidth = PAGE_W - margin * 2;
  const panelHeight = PAGE_H - margin * 2;

  await addPageWithRetry({
    title: student.name,
    background,
    elements: [
      createRectangleShape(
        margin + 6,
        margin + 6,
        panelWidth,
        panelHeight,
        "#d9d9d9",
      ),
      createRectangleShape(
        margin,
        margin,
        panelWidth,
        panelHeight,
        currentCardBgColor,
      ),
      {
        type: "text" as const,
        top: margin + 12,
        left: margin + 12,
        width: 200,
        children: ["Dit ben ik"],
        fontSize: 18,
        fontWeight: "bold" as const,
      },
      ...buildPageFooterElements(student.name),
    ],
  });
}

async function generateColoredLevelHandsPage(
  student: Student,
  apiKey: string,
  dateRange: ReportDateRange,
  selectedBackground?: BackgroundOption,
  headingFont: SelectedFont | null = null,
  bodyFont: SelectedFont | null = null,
  topText = "",
  bottomText = "",
) {
  const background = await createPageBackground(selectedBackground);
  const niveauData = await fetchNiveauHandjes(apiKey, student.id, dateRange);
  const dateEntries = Object.entries(niveauData)
    .map(([date, rows]) => ({
      date: date.trim(),
      rows: Array.isArray(rows) ? rows : [],
    }))
    .filter((entry) => entry.date.length > 0)
    .sort((a, b) => {
      const aTs = parseNiveauHandDate(a.date);
      const bTs = parseNiveauHandDate(b.date);

      if (aTs == null && bTs == null) return 0;
      if (aTs == null) return 1;
      if (bTs == null) return -1;
      return aTs - bTs;
    })
    .slice(0, 2);

  const dates = dateEntries.map((entry) => entry.date);

  const margin = 36;
  const tableTop = topText.trim() ? 112 : 92;
  const headerHeight = 40;
  const vakRowHeight = 34;
  const lineRowHeight = 34;
  const dateCols = Math.max(dates.length, 1);
  const tableWidth = PAGE_W - margin * 2;

  const dateAreaWidth = dateCols === 2 ? 210 : 120;
  const dateColWidth = dateAreaWidth / dateCols;
  const textColWidth = tableWidth - dateAreaWidth;
  const xText = margin;
  const xDateStart = xText + textColWidth;

  const vakOrder: string[] = [];
  const vakRows = new Map<string, {
    ontwikkellijnen: string[];
    colorsPerLine: Map<string, Record<string, string>>;
  }>();

  dateEntries.forEach(({ date, rows }) => {
    rows.forEach((row) => {
      const vak = row.vak?.trim();
      const ontwikkellijn = row.ontwikkellijn?.trim();
      const niveaukleur = row.niveaukleur?.trim();

      if (!vak || !ontwikkellijn || !niveaukleur) {
        return;
      }

      if (!vakRows.has(vak)) {
        vakRows.set(vak, {
          ontwikkellijnen: [],
          colorsPerLine: new Map<string, Record<string, string>>(),
        });
        vakOrder.push(vak);
      }
      const vakData = vakRows.get(vak)!;
      if (!vakData.colorsPerLine.has(ontwikkellijn)) {
        vakData.ontwikkellijnen.push(ontwikkellijn);
        vakData.colorsPerLine.set(ontwikkellijn, {});
      }
      vakData.colorsPerLine.get(ontwikkellijn)![date] = niveaukleur;
    });
  });

  const renderRows: Array<
    | { type: "vak"; vak: string }
    | { type: "ontwikkellijn"; vak: string; ontwikkellijn: string; colors: Record<string, string> }
  > = [];

  vakOrder.forEach((vak) => {
    const vakData = vakRows.get(vak);
    if (!vakData) return;
    renderRows.push({ type: "vak", vak });
    vakData.ontwikkellijnen.forEach((ontwikkellijn) => {
      renderRows.push({
        type: "ontwikkellijn",
        vak,
        ontwikkellijn,
        colors: vakData.colorsPerLine.get(ontwikkellijn) ?? {},
      });
    });
  });

  const textBoxH = 32;
  const textBoxPadH = 14;
  const textBoxPadV = 9;
  const maxBodyHeight = PAGE_H - tableTop - headerHeight - (bottomText.trim() ? 110 : 80);
  const visibleRows: typeof renderRows = [];
  let usedBodyHeight = 0;

  for (const row of renderRows) {
    const h = row.type === "vak" ? vakRowHeight : lineRowHeight;
    if (usedBodyHeight + h > maxBodyHeight) {
      break;
    }
    visibleRows.push(row);
    usedBodyHeight += h;
  }

  const tableHeight = headerHeight + usedBodyHeight;

  const elements: any[] = [
    {
      type: "text" as const,
      top: 40,
      left: margin,
      width: tableWidth,
      children: [`Ontwikkellijnen van ${student.name}`],
      fontSize: 26,
      fontWeight: "bold" as const,
      ...fontProps(headingFont),
    },
  ];

  if (topText.trim()) {
    const boxTop = 72;
    elements.push(
      createRectangleShape(boxTop + 3, margin + 3, tableWidth, textBoxH, "#cccccc"),
      createRectangleShape(boxTop, margin, tableWidth, textBoxH, currentCardBgColor),
      { type: "text" as const, top: boxTop + textBoxPadV, left: margin + textBoxPadH, width: tableWidth - textBoxPadH * 2, children: [topText], fontSize: 13, ...fontProps(bodyFont) },
    );
  }

  elements.push(createRectangleShape(tableTop, margin, tableWidth, tableHeight, currentCardBgColor));

  if (visibleRows.length === 0) {
    elements.push(
      {
        type: "text" as const,
        top: tableTop + 18,
        left: margin + 12,
        width: tableWidth - 24,
        children: ["Geen niveauhandjes gevonden voor de gekozen periode."],
        fontSize: 14,
        fontWeight: "bold" as const,
        ...fontProps(bodyFont),
      },
      {
        type: "text" as const,
        top: tableTop + 46,
        left: margin + 12,
        width: tableWidth - 24,
        children: [
          `Periode: ${dateRange.fromDate || "-"} t/m ${dateRange.toDate || "-"}`,
        ],
        fontSize: 12,
        ...fontProps(bodyFont),
      },
    );
  }

  for (let i = 0; i < dateCols; i++) {
    const x = xDateStart + i * dateColWidth;
    const date = dates[i] ?? "-";
    elements.push({
      type: "text" as const,
      top: tableTop + 10,
      left: x + 6,
      width: dateColWidth - 12,
      children: [date],
      textAlign: "center" as const,
      fontWeight: "bold" as const,
      ...fontProps(bodyFont),
    });
  }

  let cursorTop = tableTop + headerHeight;
  for (const row of visibleRows) {
    if (row.type === "vak") {
      elements.push({
        type: "text" as const,
        top: cursorTop + 8,
        left: xText + 8,
        width: tableWidth - 16,
        children: [row.vak],
        fontWeight: "bold" as const,
        ...fontProps(bodyFont),
      });
      cursorTop += vakRowHeight;
      continue;
    }

    elements.push({
      type: "text" as const,
      top: cursorTop + 8,
      left: xText + 20,
      width: textColWidth - 28,
      children: [row.ontwikkellijn],
      ...fontProps(bodyFont),
    });

    for (let i = 0; i < dates.length; i++) {
      const date = dates[i]!;
      const color = row.colors[date];
      if (!color) {
        continue;
      }
      const handRef = await uploadNiveauHand(buildNiveauHandImageUrl(color));
      const iconSize = 22;
      const x = xDateStart + i * dateColWidth + (dateColWidth - iconSize) / 2;

      elements.push({
        type: "image",
        ref: handRef,
        top: cursorTop + (lineRowHeight - iconSize) / 2,
        left: x,
        width: iconSize,
        height: iconSize,
        altText: {
          text: `niveaukleur:${color}`,
          decorative: true,
        },
      });
    }

    cursorTop += lineRowHeight;
  }

  let contentBottom = tableTop + tableHeight;

  if (visibleRows.length < renderRows.length) {
    elements.push({
      type: "text" as const,
      top: contentBottom + 10,
      left: margin,
      width: tableWidth,
      children: ["Niet alle ontwikkellijnen passen op deze pagina."],
      fontSize: 11,
      ...fontProps(bodyFont),
    });
    contentBottom += 28;
  }

  if (bottomText.trim()) {
    const boxTop = contentBottom + 16;
    elements.push(
      createRectangleShape(boxTop + 3, margin + 3, tableWidth, textBoxH, "#cccccc"),
      createRectangleShape(boxTop, margin, tableWidth, textBoxH, currentCardBgColor),
      { type: "text" as const, top: boxTop + textBoxPadV, left: margin + textBoxPadH, width: tableWidth - textBoxPadH * 2, children: [bottomText], fontSize: 13, ...fontProps(bodyFont) },
    );
  }

  await addPageWithRetry({
    title: student.name,
    background,
    elements: [...elements, ...buildPageFooterElements(student.name)],
  });
}

async function generateGoalDescriptionsPage(
  student: Student,
  apiKey: string,
  dateRange: ReportDateRange,
  selectedBackground?: BackgroundOption,
  headingFont: SelectedFont | null = null,
  bodyFont: SelectedFont | null = null,
) {
  const background = await createPageBackground(selectedBackground);
  const doelen = await fetchDoelomschrijvingen(apiKey, student.id, dateRange);

  const panelMargin = 36;
  const panelTop = 80;
  const panelWidth = PAGE_W - panelMargin * 2;
  const panelHeight = PAGE_H - panelTop - 70;
  const contentLeft = panelMargin + 16;
  const contentWidth = panelWidth - 32;
  const maxContentBottom = panelTop + panelHeight - 16;
  const groupTitleHeight = 28;
  const itemRowHeight = 52;

  const grouped: Array<{ ontwikkellijn: string; items: DoelomschrijvingRow[] }> = [];
  doelen.forEach((item) => {
    const last = grouped[grouped.length - 1];
    if (last && last.ontwikkellijn === item.ontwikkellijn) {
      last.items.push(item);
    } else {
      grouped.push({ ontwikkellijn: item.ontwikkellijn, items: [item] });
    }
  });

  // Pre-upload alle niveau-handje afbeeldingen
  const handRefs = new Map<string, ImageRef>();
  for (const group of grouped) {
    for (const item of group.items) {
      if (!handRefs.has(item.niveaukleur)) {
        handRefs.set(item.niveaukleur, await uploadNiveauHand(buildNiveauHandImageUrl(item.niveaukleur)));
      }
    }
  }

  let gIdx = 0;
  let iIdx = 0;
  let pageIndex = 0;

  while (gIdx < grouped.length) {
    const elements: any[] = [
      {
        type: "text" as const,
        top: 40,
        left: panelMargin,
        width: panelWidth,
        children: ["Ontwikkeldoelen"],
        fontSize: 26,
        fontWeight: "bold" as const,
        ...fontProps(headingFont),
      },
      createRectangleShape(panelTop, panelMargin, panelWidth, panelHeight, currentCardBgColor),
    ];

    let cursorTop = panelTop + 16;
    let pageFull = false;

    while (gIdx < grouped.length && !pageFull) {
      const group = grouped[gIdx]!;

      if (cursorTop + groupTitleHeight > maxContentBottom) {
        pageFull = true;
        break;
      }

      elements.push({
        type: "text" as const,
        top: cursorTop,
        left: contentLeft,
        width: contentWidth,
        children: [group.ontwikkellijn],
        fontWeight: "bold" as const,
        fontSize: 16,
        ...fontProps(bodyFont),
      });
      cursorTop += groupTitleHeight;

      while (iIdx < group.items.length) {
        if (cursorTop + itemRowHeight > maxContentBottom) {
          pageFull = true;
          break;
        }

        const item = group.items[iIdx]!;
        const handRef = handRefs.get(item.niveaukleur)!;

        elements.push(
          {
            type: "image",
            ref: handRef,
            top: cursorTop + 6,
            left: contentLeft,
            width: 18,
            height: 18,
            altText: { text: `niveaukleur:${item.niveaukleur}`, decorative: true },
          },
          {
            type: "text" as const,
            top: cursorTop + 7,
            left: contentLeft + 26,
            width: 190,
            children: [item.doelnaam],
            fontSize: 13,
            ...fontProps(bodyFont),
          },
          {
            type: "text" as const,
            top: cursorTop + 7,
            left: contentLeft + 224,
            width: contentWidth - 224,
            children: [item.doelomschrijving],
            textAlign: "end" as const,
            fontSize: 13,
            ...fontProps(bodyFont),
          },
        );
        cursorTop += itemRowHeight;
        iIdx++;
      }

      if (!pageFull) {
        cursorTop += 4;
        gIdx++;
        iIdx = 0;
      }
    }

    const title = pageIndex === 0 ? student.name : `${student.name} (doelen ${pageIndex + 1})`;
    await addPageWithRetry({
      title,
      background,
      elements: [...elements, ...buildPageFooterElements(student.name)],
    });
    pageIndex++;
  }
}

async function generateGoalLevelsPage(
  student: Student,
  apiKey: string,
  dateRange: ReportDateRange,
  selectedBackground?: BackgroundOption,
  headingFont: SelectedFont | null = null,
  bodyFont: SelectedFont | null = null,
) {
  const background = await createPageBackground(selectedBackground);
  const doelen = await fetchOntwikkelniveaus(apiKey, student.id, dateRange);

  const margin = 36;
  const titleTop = 40;
  const columnsTop = 90;
  const columnGap = 18;
  const availableWidth = PAGE_W - margin * 2;
  const columnWidth = (availableWidth - columnGap) / 2;
  const leftColX = margin;
  const rightColX = leftColX + columnWidth + columnGap;
  const maxBottom = PAGE_H - 60;
  const panelTop = columnsTop - 10;
  const panelHeight = maxBottom - panelTop;
  const colContentHeight = maxBottom - columnsTop;

  const grouped = new Map<string, OntwikkelniveauRow[]>();
  doelen.forEach((item) => {
    if (!grouped.has(item.ontwikkellijn)) grouped.set(item.ontwikkellijn, []);
    grouped.get(item.ontwikkellijn)!.push(item);
  });

  // Pre-upload all niveau hand images once
  const handRefCache = new Map<string, ImageRef>();
  for (const items of grouped.values()) {
    for (const item of items) {
      for (const c of ["1", "2"] as const) {
        const color = item.niveaukleur?.[c];
        if (color && !handRefCache.has(color)) {
          handRefCache.set(color, await uploadNiveauHand(buildNiveauHandImageUrl(color)));
        }
      }
    }
  }

  type Block = { ontwikkellijn: string; items: OntwikkelniveauRow[]; estHeight: number; estElements: number };
  const allBlocks: Block[] = [];
  for (const [ontwikkellijn, items] of grouped.entries()) {
    const estElements = 1 + items.reduce((sum, item) => {
      let e = 1;
      if (item.niveaukleur?.["1"]) e++;
      if (item.niveaukleur?.["2"]) e++;
      return sum + e;
    }, 0);
    allBlocks.push({ ontwikkellijn, items, estHeight: 26 + items.length * 30 + 8, estElements });
  }

  // Distribute blocks across pages respecting element limit (100) and column height
  const MAX_CONTENT_ELEMENTS = 94; // leaves room for title, rect, footer
  const pageGroups: Array<{ left: Block[]; right: Block[] }> = [];
  let bIdx = 0;

  while (bIdx < allBlocks.length) {
    const pageBlocks: Block[] = [];
    let pageElements = 0;
    let lH = 0;
    let rH = 0;

    while (bIdx < allBlocks.length) {
      const block = allBlocks[bIdx]!;
      if (pageElements + block.estElements > MAX_CONTENT_ELEMENTS) break;
      const goLeft = lH <= rH;
      if (goLeft && lH + block.estHeight > colContentHeight) break;
      if (!goLeft && rH + block.estHeight > colContentHeight) break;
      if (goLeft) lH += block.estHeight;
      else rH += block.estHeight;
      pageBlocks.push(block);
      pageElements += block.estElements;
      bIdx++;
    }

    // Safety: always advance at least one block to avoid infinite loop
    if (pageBlocks.length === 0 && bIdx < allBlocks.length) {
      pageBlocks.push(allBlocks[bIdx]!);
      bIdx++;
    }

    // Balance pageBlocks between left and right columns
    const left: Block[] = [];
    const right: Block[] = [];
    let ll = 0;
    let rr = 0;
    for (const b of pageBlocks) {
      if (ll <= rr) { left.push(b); ll += b.estHeight; }
      else { right.push(b); rr += b.estHeight; }
    }
    pageGroups.push({ left, right });
  }

  for (let pageIdx = 0; pageIdx < pageGroups.length; pageIdx++) {
    const { left, right } = pageGroups[pageIdx]!;
    const elements: any[] = [
      {
        type: "text" as const,
        top: titleTop,
        left: margin,
        width: availableWidth,
        children: ["Ontwikkeldoelen niveaus"],
        fontSize: 26,
        fontWeight: "bold" as const,
        ...fontProps(headingFont),
      },
      createRectangleShape(panelTop, margin, availableWidth, panelHeight, currentCardBgColor),
    ];

    const renderCol = (x: number, blocksToRender: Block[]) => {
      let y = columnsTop;
      for (const block of blocksToRender) {
        elements.push({
          type: "text" as const,
          top: y,
          left: x,
          width: columnWidth,
          children: [block.ontwikkellijn],
          fontWeight: "bold" as const,
          fontSize: 15,
          ...fontProps(bodyFont),
        });
        y += 26;

        for (const item of block.items) {
          const color1 = item.niveaukleur?.["1"];
          const color2 = item.niveaukleur?.["2"];
          const iconTop = y + 4;
          const iconSize = 18;
          let textLeft = x;

          if (color1) {
            elements.push({
              type: "image",
              ref: handRefCache.get(color1)!,
              top: iconTop, left: x, width: iconSize, height: iconSize,
              altText: { text: `niveaukleur:${color1}`, decorative: true },
            });
            textLeft = x + 22;
          }
          if (color2) {
            elements.push({
              type: "image",
              ref: handRefCache.get(color2)!,
              top: iconTop, left: x + 22, width: iconSize, height: iconSize,
              altText: { text: `niveaukleur:${color2}`, decorative: true },
            });
            textLeft = x + 44;
          }
          elements.push({
            type: "text" as const,
            top: y + 2,
            left: textLeft + 4,
            width: columnWidth - (textLeft - x) - 4,
            children: [item.doelnaam],
            fontSize: 13,
            ...fontProps(bodyFont),
          });
          y += 30;
        }
        y += 8;
      }
    };

    renderCol(leftColX, left);
    renderCol(rightColX, right);

    const title = pageIdx === 0 ? student.name : `${student.name} (niveaus ${pageIdx + 1})`;
    await addPageWithRetry({
      title,
      background,
      elements: [...elements, ...buildPageFooterElements(student.name)],
    });
  }
}

async function generateGroeigrafiekenPage(
  student: Student,
  apiKey: string,
  dateRange: ReportDateRange,
  selectedBackground?: BackgroundOption,
  headingFont: SelectedFont | null = null,
  bodyFont: SelectedFont | null = null,
  topText = "",
  bottomText = "",
) {
  const charts = await fetchGroeigrafieken(apiKey, student.id, dateRange);
  if (charts.length === 0) return;

  const outerMargin = 58;
  const colGap = 24;
  const rowGap = 24;
  const cardsPerRow = 2;
  const cardW = Math.floor((PAGE_W - outerMargin * 2 - colGap * (cardsPerRow - 1)) / cardsPerRow);
  const chartPad = 12;
  const chartW = cardW - chartPad * 2;
  const chartH = Math.round(chartW * 569 / 700);
  const cardPadTop = 12;
  const chartToLabel = 6;
  const labelH = 18;
  const cardPadBottom = 8;
  const cardH = cardPadTop + chartH + chartToLabel + labelH + cardPadBottom;
  const textBoxH = 32;
  const textBoxPadH = 14;
  const textBoxPadV = 9;
  const cardsStartTop = topText.trim() ? 100 : 80;
  const availH = PAGE_H - 44 - (bottomText.trim() ? 64 : 0) - cardsStartTop;
  const rowsPerPage = Math.floor((availH + rowGap) / (cardH + rowGap));
  const cardsPerPage = cardsPerRow * rowsPerPage;

  for (let pageIndex = 0; pageIndex * cardsPerPage < charts.length; pageIndex++) {
    const pageCharts = charts.slice(pageIndex * cardsPerPage, (pageIndex + 1) * cardsPerPage);
    const background = await createPageBackground(selectedBackground);
    const pageTitle = pageIndex === 0
      ? `Groeigrafieken van ${student.name}`
      : `Groeigrafieken van ${student.name} (vervolg)`;

    const contentWidth = PAGE_W - outerMargin * 2;
    const elements: any[] = [
      {
        type: "text" as const,
        top: 36,
        left: outerMargin,
        width: contentWidth,
        children: [pageTitle],
        fontSize: 22,
        fontWeight: "bold" as const,
        ...fontProps(headingFont),
      },
    ];

    if (topText.trim()) {
      const boxTop = 62;
      elements.push(
        createRectangleShape(boxTop + 3, outerMargin + 3, contentWidth, textBoxH, "#cccccc"),
        createRectangleShape(boxTop, outerMargin, contentWidth, textBoxH, currentCardBgColor),
        { type: "text" as const, top: boxTop + textBoxPadV, left: outerMargin + textBoxPadH, width: contentWidth - textBoxPadH * 2, children: [topText], fontSize: 13, ...fontProps(bodyFont) },
      );
    }

    for (let i = 0; i < pageCharts.length; i++) {
      const chart = pageCharts[i];
      if (!chart) continue;
      const row = Math.floor(i / cardsPerRow);
      const col = i % cardsPerRow;
      const cardLeft = outerMargin + col * (cardW + colGap);
      const cardTop = cardsStartTop + row * (cardH + rowGap);

      const chartRef = await upload({
        type: "image",
        mimeType: "image/png",
        url: chart.chart,
        thumbnailUrl: chart.chart,
        aiDisclosure: "none",
      }).then((asset) => asset.ref);

      elements.push(
        createRectangleShape(cardTop + 4, cardLeft + 4, cardW, cardH, "#cccccc"),
        createRectangleShape(cardTop, cardLeft, cardW, cardH, currentCardBgColor),
        {
          type: "image",
          ref: chartRef,
          top: cardTop + cardPadTop,
          left: cardLeft + chartPad,
          width: chartW,
          height: chartH,
        },
        {
          type: "text" as const,
          top: cardTop + cardPadTop + chartH + chartToLabel,
          left: cardLeft + chartPad,
          width: chartW,
          children: [chart.leerlijn],
          fontSize: 12,
          textAlign: "center" as const,
          ...fontProps(bodyFont),
        },
      );
    }

    if (bottomText.trim()) {
      const numRows = Math.ceil(pageCharts.length / cardsPerRow);
      const lastCardBottom = cardsStartTop + numRows * cardH + (numRows - 1) * rowGap;
      const boxTop = lastCardBottom + 16;
      elements.push(
        createRectangleShape(boxTop + 3, outerMargin + 3, contentWidth, textBoxH, "#cccccc"),
        createRectangleShape(boxTop, outerMargin, contentWidth, textBoxH, currentCardBgColor),
        { type: "text" as const, top: boxTop + textBoxPadV, left: outerMargin + textBoxPadH, width: contentWidth - textBoxPadH * 2, children: [bottomText], fontSize: 13, ...fontProps(bodyFont) },
      );
    }

    await addPageWithRetry({
      title: pageIndex === 0 ? student.name : `${student.name} (grafieken ${pageIndex + 1})`,
      background,
      elements: [...elements, ...buildPageFooterElements(student.name)],
    });
  }
}

async function createPageBackground(selectedBackground?: BackgroundOption) {
  if (!selectedBackground) {
    return undefined;
  }

  const ref = await uploadBackground(selectedBackground.url);
  return {
    asset: {
      type: "image" as const,
      ref,
      altText: { text: "Achtergrond", decorative: true },
    },
  };
}

type SelectedFont = { ref: FontRef; name: string };

function fontProps(font: SelectedFont | null): { fontRef?: FontRef } {
  return font ? { fontRef: font.ref } : {};
}

function buildPageFooterElements(studentName: string) {
  return [
    {
      type: "text" as const,
      top: PAGE_H - 44,
      left: 40,
      width: PAGE_W - 80,
      children: [`© MijnKleutergroep - ${studentName}`],
      fontSize: 12,
      textAlign: "start" as const,
    },
  ];
}

async function generateRapport(
  student: Student,
  ref: ImageRef,
  teacherName: string,
  reportTitle: string,
  reportFooter: string,
  selectedTapes: TapeOption[],
  logoRef: ImageRef | undefined,
  logoAspectRatio: number | undefined,
  selectedBackground?: BackgroundOption,
  headingFont: SelectedFont | null = null,
  bodyFont: SelectedFont | null = null,
): Promise<ImageRef> {
  console.log("[generateRapport] createPageBackground...");
  const background = await createPageBackground(selectedBackground);
  console.log("[generateRapport] uploadPhoto placeholder...");
  const placeholderRef = await uploadPhoto(buildStudentPlaceholderUrl(student.id));
  console.log("[generateRapport] buildPolaroidElements...");
  const polaroids = await buildPolaroidElements(
    student,
    selectedTapes,
    placeholderRef,
    bodyFont,
  );
  // Kader voor student info (foto, naam, geboortedatum, leerkracht, logo)
  const infoCardMargin = 35;
  const infoCardLeft = infoCardMargin;
  const infoCardWidth = PAGE_W - infoCardMargin * 2;
  const infoCardTop = 100;
  const photoSize = 130;
  const infoCardHeight = 170;

  const logoBoxWidth = 160;
  const logoBoxHeight = 80;
  const logoRatio = logoAspectRatio && logoAspectRatio > 0 ? logoAspectRatio : 2;
  const fittedLogoWidth = Math.round(Math.min(logoBoxWidth, logoBoxHeight * logoRatio));
  const fittedLogoHeight = Math.round(fittedLogoWidth / logoRatio);
  const logoLeft = Math.round(infoCardLeft + infoCardWidth - 50 - fittedLogoWidth / 2);
  const logoTop = Math.round(infoCardTop + (infoCardHeight - fittedLogoHeight) / 2);

  const pageElements = [
    {
      type: "text" as const,
      top: 24,
      left: 40,
      width: PAGE_W - 80,
      children: [reportTitle || " "],
      fontSize: 48,
      fontWeight: "bold" as const,
      textAlign: "center" as const,
      ...fontProps(headingFont),
    },
    createRectangleShape(infoCardTop, infoCardLeft, infoCardWidth, infoCardHeight, currentCardBgColor),
    {
      type: "image" as const,
      ref,
      top: infoCardTop + 20,
      left: infoCardLeft + 20,
      width: photoSize,
      height: photoSize,
      altText: { text: getStudentPhotoAltText(student), decorative: false as const },
    },
    {
      type: "text" as const,
      top: infoCardTop + 20,
      left: infoCardLeft + 160,
      width: infoCardWidth - 200,
      children: [student.name],
      ...fontProps(bodyFont),
    },
    {
      type: "text" as const,
      top: infoCardTop + 60,
      left: infoCardLeft + 160,
      width: infoCardWidth - 200,
      children: [`Geboortedatum: ${student.birthDate}`],
      ...fontProps(bodyFont),
    },
    {
      type: "text" as const,
      top: infoCardTop + 100,
      left: infoCardLeft + 160,
      width: infoCardWidth - 200,
      children: [`Leerkracht: ${teacherName || "-"}`],
      ...fontProps(bodyFont),
    },
    ...(logoRef
      ? [
          {
            type: "image" as const,
            ref: logoRef,
            top: logoTop,
            left: logoLeft,
            width: fittedLogoWidth,
            height: fittedLogoHeight,
            altText: { text: "Schoollogo", decorative: true as const },
          },
        ]
      : []),
    ...polaroids,
    ...(reportFooter.trim()
      ? [
          createRectangleShape(978, 40, PAGE_W - 80, 130, currentCardBgColor),
          {
            type: "text" as const,
            top: 990,
            left: 56,
            width: PAGE_W - 112,
            children: [reportFooter.trim()],
            fontSize: 16,
            ...fontProps(bodyFont),
          },
        ]
      : []),
    ...buildPageFooterElements(student.name),
  ];

  console.log("[generateRapport] addPage met", pageElements.length, "elementen");
  console.log("[generateRapport] elementen:", JSON.stringify(pageElements.map(el => ({
    ...el,
    ref: (el as any).ref ? "[ref]" : undefined,
  }))));

  await addPageWithRetry({
    title: student.name,
    ...(background ? { background } : {}),
    elements: pageElements,
  });

  return placeholderRef;
}

async function generatePortfolio(
  student: Student,
  ref: ImageRef,
  selectedBackground?: BackgroundOption,
  headingFont: SelectedFont | null = null,
  bodyFont: SelectedFont | null = null,
) {
  const lastObs = student.observations[student.observations.length - 1];
  const background = await createPageBackground(selectedBackground);

  await addPageWithRetry({
    title: student.name,
    background,
    elements: [
      // Grote foto
      {
        type: "image",
        ref,
        top: 60,
        left: PAGE_W / 2 - 180,
        width: 360,
        height: 360,
        altText: {
          text: getStudentPhotoAltText(student),
          decorative: false,
        },
      },
      // Naam
      {
        type: "text",
        top: 440,
        left: 40,
        width: PAGE_W - 80,
        children: [student.name],
        ...fontProps(bodyFont),
      },
      // Laatste observatie
      ...(lastObs
        ? [
            {
              type: "text" as const,
              top: 520,
              left: 40,
              width: PAGE_W - 80,
              children: [`"${lastObs.note}"`],
              ...fontProps(bodyFont),
            },
          ]
        : []),
      ...buildPageFooterElements(student.name),
    ],
  });
}

async function generateGroei(
  student: Student,
  ref: ImageRef,
  selectedBackground?: BackgroundOption,
  headingFont: SelectedFont | null = null,
  bodyFont: SelectedFont | null = null,
) {
  const background = await createPageBackground(selectedBackground);

  await addPageWithRetry({
    title: student.name,
    background,
    elements: [
      // Kleine foto
      {
        type: "image",
        ref,
        top: 40,
        left: 40,
        width: 100,
        height: 100,
        altText: {
          text: getStudentPhotoAltText(student),
          decorative: false,
        },
      },
      // Naam
      {
        type: "text",
        top: 40,
        left: 160,
        width: 600,
        children: [student.name],
        ...fontProps(headingFont),
      },
      // Klas + geboortedatum
      {
        type: "text",
        top: 96,
        left: 160,
        width: 600,
        children: [`${student.group} · ${student.birthDate}`],
        ...fontProps(bodyFont),
      },
      // Groeiobservaties als tekstregels (breed ondersteund in addPage)
      ...student.observations.slice(0, 12).map((obs, index) => ({
        type: "text" as const,
        top: 180 + index * 42,
        left: 40,
        width: PAGE_W - 80,
        children: [
          `${obs.date} · ${obs.domain} · Score: ${obs.score?.toString() ?? "-"} · ${obs.note}`,
        ],
        ...fontProps(bodyFont),
      })),
      ...buildPageFooterElements(student.name),
    ],
  });
}

// Helper: wacht een aantal ms
function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Helper: addPage met retry en exponential backoff bij rate limiting
async function addPageWithRetry(page: Parameters<typeof addPage>[0], maxRetries = 6, baseDelay = 1200) {
  let attempt = 0;
  let lastError;
  while (attempt <= maxRetries) {
    try {
      return await addPage(page);
    } catch (e: any) {
      const errorCode = e instanceof CanvaError ? e.code : e?.code;
      const isRateLimited =
        errorCode === "rate_limited" ||
        (typeof e?.message === "string" && e.message.includes("rate_limited"));

      if (isRateLimited) {
        const wait = baseDelay * Math.pow(2, attempt);
        await delay(wait);
        attempt++;
        lastError = e;
        continue;
      }
      throw e;
    }
  }
  throw lastError || new Error("addPage failed after retries");
}

// Genereer pagina's voor een leerling, met throttling om rate limiting te voorkomen
async function generatePageForStudent(
  student: Student,
  templateId: Template["id"],
  apiKey: string,
  dateRange: ReportDateRange,
  teacherName: string,
  reportTitle: string,
  reportFooter: string,
  selectedTapes: TapeOption[],
  reportContentOptions: ReportContentOptions,
  logoRef: ImageRef | undefined,
  logoAspectRatio: number | undefined,
  selectedBackground?: BackgroundOption,
  headingFont: SelectedFont | null = null,
  bodyFont: SelectedFont | null = null,
  extraTexts: PageExtraTexts = { coloredLevelHandsTopText: "", coloredLevelHandsBottomText: "", studentGraphsTopText: "", studentGraphsBottomText: "" },
): Promise<ImageRef[]> {
  const mappedRefs: ImageRef[] = [];
  let ref: ImageRef | undefined;

  // throttle tussen elke pagina-aanmaak (bijv. 400ms)
  const THROTTLE_MS = 400;

  if (templateId === "rapport") {
    console.log("[Genereren] Stap 1: uploadPhoto", student.photoUrl);
    ref = await uploadPhoto(student.photoUrl);
    console.log("[Genereren] Stap 1 OK, ref:", ref);
    mappedRefs.push(ref);
    console.log("[Genereren] Stap 2: generateRapport");
    const placeholderRef = await generateRapport(
      student,
      ref,
      teacherName,
      reportTitle,
      reportFooter,
      selectedTapes,
      logoRef,
      logoAspectRatio,
      selectedBackground,
      headingFont,
      bodyFont,
    );
    mappedRefs.push(placeholderRef);
    await delay(THROTTLE_MS);

    if (reportContentOptions.extraPhotosPage) {
      const extraPhotoRef = await generateExtraPolaroidPage(
        student,
        selectedTapes,
        true,
        selectedBackground,
        bodyFont,
      );
      if (extraPhotoRef) {
        mappedRefs.push(extraPhotoRef);
      }
      await delay(THROTTLE_MS);
    }

    if (reportContentOptions.extraTextBoxesPage) {
      await generateExtraPolaroidPage(
        student,
        selectedTapes,
        false,
        selectedBackground,
        bodyFont,
      );
      await delay(THROTTLE_MS);
    }

    if (reportContentOptions.selfDrawing) {
      await generateSelfDrawingPage(student, selectedBackground);
      await delay(THROTTLE_MS);
    }

    if (reportContentOptions.coloredLevelHands) {
      await generateColoredLevelHandsPage(student, apiKey, dateRange, selectedBackground, headingFont, bodyFont, extraTexts.coloredLevelHandsTopText, extraTexts.coloredLevelHandsBottomText);
      await delay(THROTTLE_MS);
    }

    if (reportContentOptions.goalDescriptions) {
      await generateGoalDescriptionsPage(student, apiKey, dateRange, selectedBackground, headingFont, bodyFont);
      await delay(THROTTLE_MS);
    }

    if (reportContentOptions.goalLevels) {
      await generateGoalLevelsPage(student, apiKey, dateRange, selectedBackground, headingFont, bodyFont);
      await delay(THROTTLE_MS);
    }

    if (reportContentOptions.studentGraphs) {
      await generateGroeigrafiekenPage(student, apiKey, dateRange, selectedBackground, headingFont, bodyFont, extraTexts.studentGraphsTopText, extraTexts.studentGraphsBottomText);
      await delay(THROTTLE_MS);
    }
  }

  if (templateId === "portfolio") {
    ref = await uploadPhoto(student.photoUrl);
    mappedRefs.push(ref);
    await generatePortfolio(student, ref, selectedBackground, headingFont, bodyFont);
    await delay(THROTTLE_MS);
  }

  if (templateId === "groei") {
    ref = await uploadPhoto(student.photoUrl);
    mappedRefs.push(ref);
    await generateGroei(student, ref, selectedBackground, headingFont, bodyFont);
    await delay(THROTTLE_MS);
  }

  return mappedRefs;
}

// ─── Screens ──────────────────────────────────────────────────────────────────

// 1. Instellingen

function SettingsScreen({
  teacherName,
  onTeacherNameChange,
  reportTitle,
  onReportTitleChange,
  reportFooter,
  onReportFooterChange,
  selectedBackground,
  onOpenBackgroundPicker,
  canAddPage,
  selectedTapes,
  onOpenTapePicker,
  reportContentOptions,
  onReportContentOptionChange,
  headingFont,
  onHeadingFontChange,
  bodyFont,
  onBodyFontChange,
  cardBgColor,
  onCardBgColorChange,
  cardBgAlpha,
  onCardBgAlphaChange,
}: {
  teacherName: string;
  onTeacherNameChange: (name: string) => void;
  reportTitle: string;
  canAddPage: boolean;
  onReportTitleChange: (title: string) => void;
  reportFooter: string;
  onReportFooterChange: (text: string) => void;
  selectedBackground?: BackgroundOption;
  onOpenBackgroundPicker: () => void;
  selectedTapes: TapeOption[];
  onOpenTapePicker: () => void;
  reportContentOptions: ReportContentOptions;
  onReportContentOptionChange: (
    key: keyof ReportContentOptions,
    checked: boolean,
  ) => void;
  headingFont: SelectedFont | null;
  onHeadingFontChange: (font: SelectedFont | null) => void;
  bodyFont: SelectedFont | null;
  onBodyFontChange: (font: SelectedFont | null) => void;
  cardBgColor: string;
  onCardBgColorChange: (color: string) => void;
  cardBgAlpha: number;
  onCardBgAlphaChange: (alpha: number) => void;
}) {
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const connect = async () => {
    const key = input.trim();
    if (!key) return;
    setLoading(true);
    setError("");
    try {
      await apiFetch("VALIDATE", key);
      localStorage.setItem(STORAGE_KEY, key);
      onConnected(key);
    } catch {
      setError("Ongeldige koppelcode. Controleer of je de juiste code hebt gekopieerd vanuit de app.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Rows spacing="3u">
      <Rows spacing="1u">
        <Text variant="bold">Leerkrachtnaam</Text>
        <TextInput
          value={teacherName}
          onChange={onTeacherNameChange}
          placeholder="Bijv. Mevrouw Jansen"
        />
      </Rows>

      <Rows spacing="1u">
        <Text variant="bold">Titel rapport</Text>
        <TextInput
          value={reportTitle}
          onChange={onReportTitleChange}
          placeholder={DEFAULT_REPORT_TITLE}
        />
      </Rows>

      <Rows spacing="1u">
        <Text variant="bold">Tekst onder rapport</Text>
        <MultilineInput
          value={reportFooter}
          onChange={onReportFooterChange}
          placeholder="Tekst die onderaan de 1e pagina in een wit kader verschijnt (optioneel)"
          minRows={3}
        />
      </Rows>

      <Rows spacing="1u">
        <Text variant="bold">Achtergrond instellen</Text>
        <Text tone="tertiary">
          {selectedBackground
            ? `Geselecteerd: ${selectedBackground.name}`
            : "Nog geen achtergrond geselecteerd."}
        </Text>
        <Button variant="secondary" onClick={onOpenBackgroundPicker} stretch>
          Achtergrond instellen
        </Button>
      </Rows>

      <Rows spacing="1u">
        <Text variant="bold">Tapes kiezen</Text>
        <Text tone="tertiary">
          {selectedTapes.length > 0
            ? `${selectedTapes.length} van 10 geselecteerd`
            : "Nog geen tapes geselecteerd."}
        </Text>
        <Button variant="secondary" onClick={onOpenTapePicker} stretch>
          Tapes kiezen
        </Button>
      </Rows>

      <Rows spacing="1u">
        <Text variant="bold">Font voor koppen</Text>
        <Button
          variant="secondary"
          onClick={async () => {
            const res = await requestFontSelection(
              headingFont ? { selectedFontRef: headingFont.ref } : undefined,
            );
            if (res.type === "completed") {
              onHeadingFontChange({ ref: res.font.ref, name: res.font.name });
            }
          }}
        >
          {headingFont ? headingFont.name : "Standaard (klik om te kiezen)"}
        </Button>
        {headingFont && (
          <Button variant="secondary" onClick={() => onHeadingFontChange(null)}>
            Wissen
          </Button>
        )}
      </Rows>

      <Rows spacing="1u">
        <Text variant="bold">Font voor teksten</Text>
        <Button
          variant="secondary"
          onClick={async () => {
            const res = await requestFontSelection(
              bodyFont ? { selectedFontRef: bodyFont.ref } : undefined,
            );
            if (res.type === "completed") {
              onBodyFontChange({ ref: res.font.ref, name: res.font.name });
            }
          }}
        >
          {bodyFont ? bodyFont.name : "Standaard (klik om te kiezen)"}
        </Button>
        {bodyFont && (
          <Button variant="secondary" onClick={() => onBodyFontChange(null)}>
            Wissen
          </Button>
        )}
      </Rows>

      <Rows spacing="1u">
        <Text variant="bold">Achtergrondkleur vlakken</Text>
        <Text tone="tertiary">Kleur van de kaarten en tekstblokken op gegenereerde pagina's. (standaard: wit)</Text>
        <ColorSelector color={cardBgColor} onChange={onCardBgColorChange} />
        <Text tone="tertiary">Dekking: {cardBgAlpha}%</Text>
        <Slider min={0} max={100} step={1} value={cardBgAlpha} onChange={onCardBgAlphaChange} />
      </Rows>

      {/* Koppelcode en ontkoppelen zijn nu verplaatst naar SupportScreen */}
    </Rows>
  );
}

// 2. Genereren
type GenerateScreenProps = {
  apiKey: string;
  onGenerate: (students: Student[], template: Template["id"], extraTexts: PageExtraTexts) => void;
  generationError?: string;

  reportContentOptions: ReportContentOptions;
  onReportContentOptionChange: (key: keyof ReportContentOptions, value: boolean) => void;
  canAddPage: boolean;
  reportDateRange: ReportDateRange;
  onReportDateRangeChange: (next: ReportDateRange) => void;
};

function GenerateScreen({
  apiKey,
  onGenerate,
  generationError,
  reportContentOptions,
  onReportContentOptionChange,
  canAddPage,
  reportDateRange,
  onReportDateRangeChange,
}: GenerateScreenProps) {
  const [groups, setGroups] = useState<Group[]>([]);
  const [groupStudents, setGroupStudents] = useState<Student[]>([]);
  const [allStudents, setAllStudents] = useState<Student[]>([]);
  const [selectionMode, setSelectionMode] = useState<"group" | "student">("group");
  const [selectedGroup, setSelectedGroup] = useState<string>("");
  const [selectedStudentId, setSelectedStudentId] = useState<string>("");
  const [selectedTemplate, setSelectedTemplate] = useState<Template["id"]>("rapport");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [coloredLevelHandsTopText, setColoredLevelHandsTopText] = useState("");
  const [coloredLevelHandsBottomText, setColoredLevelHandsBottomText] = useState("");
  const [studentGraphsTopText, setStudentGraphsTopText] = useState("");
  const [studentGraphsBottomText, setStudentGraphsBottomText] = useState("");

  useEffect(() => {
    if (!apiKey) {
      setGroups([]);
      setGroupStudents([]);
      setAllStudents([]);
      setSelectionMode("group");
      setSelectedGroup("");
      setSelectedStudentId("");
      setLoadError("");
      setLoading(false);
      return;
    }

    const load = async () => {
      setLoading(true);
      setLoadError("");
      try {
        const [groupData, allStudentsData] = await Promise.all([
          apiFetch("GROUPS", apiKey) as Promise<Group[]>,
          fetchStudents(apiKey, "0"),
        ]);

        setGroups(groupData);
        setAllStudents(allStudentsData);

        const firstStudent = allStudentsData[0];
        if (firstStudent) {
          setSelectedStudentId((current) =>
            current && allStudentsData.some((student) => student.id === current)
              ? current
              : firstStudent.id,
          );
        } else {
          setSelectedStudentId("");
        }

        const firstGroup = groupData[0];
        if (firstGroup) {
          setSelectedGroup(firstGroup.id);
        } else {
          setSelectedGroup("");
          setGroupStudents([]);
        }
      } catch {
        setLoadError("Kon gegevens niet ophalen. Controleer je verbinding.");
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [apiKey]);

  useEffect(() => {
    if (!apiKey || !selectedGroup) {
      setGroupStudents([]);
      return;
    }

    let cancelled = false;

    const loadGroupStudents = async () => {
      try {
        const studentData = await fetchStudents(apiKey, selectedGroup);
        if (!cancelled) {
          setGroupStudents(studentData);
        }
      } catch {
        if (!cancelled) {
          setGroupStudents([]);
          setLoadError("Kon leerlingen voor deze groep niet ophalen.");
        }
      }
    };

    loadGroupStudents();

    return () => {
      cancelled = true;
    };
  }, [apiKey, selectedGroup]);

  const selectedStudent = allStudents.find((student) => student.id === selectedStudentId);
  const studentsToGenerate =
    selectionMode === "student"
      ? selectedStudent
        ? [selectedStudent]
        : []
      : groupStudents;
  const visibleTemplates = TEMPLATES.filter((template) =>
    AVAILABLE_TEMPLATES.includes(template.id),
  );

  if (loading) return <LoadingIndicator />;
  if (!apiKey) {
    return (
      <Rows spacing="2u">
        <Text variant="bold" size="large">Genereren</Text>
        <Text tone="tertiary">
          Koppel eerst je account in het tabje Aanpassen om pagina's te
          kunnen genereren.
        </Text>
      </Rows>
    );
  }

  if (loadError) return (
    <Rows spacing="2u">
      <Text tone="critical">{loadError}</Text>
    </Rows>
  );

  return (
    <Rows spacing="3u">

      {/* Stap 1 — Groep */}
      <Rows spacing="1u">
        <Text variant="bold">① Kies wat je wilt genereren</Text>
        <RadioGroup
          value={selectionMode}
          onChange={(value) => setSelectionMode(value as "group" | "student")}
          options={[
            {
              value: "group",
              label: "Een hele groep",
              description: "Genereer voor alle leerlingen in 1 groep",
            },
            {
              value: "student",
              label: "Een individuele leerling",
              description: "Genereer 1 enkel rapport",
            },
          ]}
        />

        {selectionMode === "group" ? (
          <>
            <Text variant="bold">Kies een groep</Text>
            <RadioGroup
              value={selectedGroup}
              onChange={setSelectedGroup}
              options={groups.map((g) => ({
                value: g.id,
                label: g.name,
                description: `${g.studentCount} leerlingen`,
              }))}
            />
          </>
        ) : (
          <>
            <Text variant="bold">Kies een leerling</Text>
            <RadioGroup
              value={selectedStudentId}
              onChange={setSelectedStudentId}
              options={allStudents.map((student) => ({
                value: student.id,
                label: student.name,
                description: student.group,
              }))}
            />
          </>
        )}
      </Rows>

      {/* Stap 2 — Datums */}
      <Rows spacing="1u">
        <Text variant="bold">② Van en tot datum</Text>
        <Text tone="tertiary">
          Deze datums worden gebruikt voor het berekenen van de behaalde niveaus.
        </Text>
        <div
          style={{
            display: "grid",
            gap: 12,
            gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
          }}
        >
          <label style={{ display: "grid", gap: 6 }}>
            <Text variant="bold">Van datum</Text>
            <input
              type="date"
              value={reportDateRange.fromDate}
              onChange={(event) =>
                onReportDateRangeChange({
                  ...reportDateRange,
                  fromDate: event.target.value,
                })
              }
              style={{
                border: "1px solid #cbd5e1",
                borderRadius: 8,
                padding: "10px 12px",
                font: "inherit",
              }}
            />
          </label>
          <label style={{ display: "grid", gap: 6 }}>
            <Text variant="bold">Tot datum</Text>
            <input
              type="date"
              value={reportDateRange.toDate}
              onChange={(event) =>
                onReportDateRangeChange({
                  ...reportDateRange,
                  toDate: event.target.value,
                })
              }
              style={{
                border: "1px solid #cbd5e1",
                borderRadius: 8,
                padding: "10px 12px",
                font: "inherit",
              }}
            />
          </label>
        </div>
      </Rows>

      {/* Stap 3 — Template */}
      <Rows spacing="1u">
        <Text variant="bold">③ Kies een template</Text>
        <Rows spacing="1u">
          {visibleTemplates.map((t) => (
            <Box
              key={t.id}
              style={{
                border: selectedTemplate === t.id ? '2px solid var(--ui-kit-color-brand)' : '1px solid #ddd',
                borderRadius: 8,
                padding: 12,
                cursor: 'pointer',
                background: selectedTemplate === t.id ? 'var(--ui-kit-color-surface-subtle)' : 'white',
              }}
              onClick={() => setSelectedTemplate(t.id)}
            >
              <Text variant="bold">{t.emoji} {t.label}</Text>
              <Text tone="tertiary">{t.description}</Text>
            </Box>
          ))}
        </Rows>
        <Box paddingTop="2u">
        <Rows spacing="1u">
          <Text variant="bold">Inhoud rapport per leerling</Text>
          <Checkbox
            label="Voorpagina (foto pagina)"
            checked={true}
            disabled
          />
          <Checkbox
            label="Extra pagina met 6 foto's"
            checked={reportContentOptions.extraPhotosPage}
            onChange={(_, checked) =>
              onReportContentOptionChange("extraPhotosPage", checked)
            }
          />
          <Checkbox
            label="Extra pagina met 6 tekstvakken"
            checked={reportContentOptions.extraTextBoxesPage}
            onChange={(_, checked) =>
              onReportContentOptionChange("extraTextBoxesPage", checked)
            }
          />
          <Checkbox
            label="Gekleurde niveauhandjes"
            checked={reportContentOptions.coloredLevelHands}
            onChange={(_, checked) =>
              onReportContentOptionChange("coloredLevelHands", checked)
            }
          />
          {reportContentOptions.coloredLevelHands && (
            <Box paddingStart="2u">
              <Rows spacing="1u">
                <MultilineInput
                  value={coloredLevelHandsTopText}
                  onChange={setColoredLevelHandsTopText}
                  placeholder="Tekst boven de pagina (optioneel)"
                />
                <MultilineInput
                  value={coloredLevelHandsBottomText}
                  onChange={setColoredLevelHandsBottomText}
                  placeholder="Tekst onder de pagina (optioneel)"
                />
              </Rows>
            </Box>
          )}
          <Checkbox
            label="Leerlinggrafieken"
            checked={reportContentOptions.studentGraphs}
            onChange={(_, checked) =>
              onReportContentOptionChange("studentGraphs", checked)
            }
          />
          {reportContentOptions.studentGraphs && (
            <Box paddingStart="2u">
              <Rows spacing="1u">
                <MultilineInput
                  value={studentGraphsTopText}
                  onChange={setStudentGraphsTopText}
                  placeholder="Tekst boven de pagina (optioneel)"
                />
                <MultilineInput
                  value={studentGraphsBottomText}
                  onChange={setStudentGraphsBottomText}
                  placeholder="Tekst onder de pagina (optioneel)"
                />
              </Rows>
            </Box>
          )}
          <Checkbox
            label="ik-tekening"
            checked={reportContentOptions.selfDrawing}
            onChange={(_, checked) =>
              onReportContentOptionChange("selfDrawing", checked)
            }
          />
          <Checkbox
            label="Doelniveau met omschrijving"
            checked={reportContentOptions.goalDescriptions}
            onChange={(_, checked) =>
              onReportContentOptionChange("goalDescriptions", checked)
            }
          />
          <Checkbox
            label="Ontwikkeldoelen met niveaus"
            checked={reportContentOptions.goalLevels}
            onChange={(_, checked) =>
              onReportContentOptionChange("goalLevels", checked)
            }
          />
        </Rows>
        </Box>
      </Rows>

      {/* Stap 4 — Genereren */}
      <Rows spacing="1u">
        <Text variant="bold">④ Genereer pagina's</Text>
        {generationError && <Text tone="tertiary">{generationError}</Text>}
        {!canAddPage && (
          <Text tone="critical">
            Dit Canva-document ondersteunt geen nieuwe pagina's. Open het rapport in een documenttype dat pagina's kan toevoegen.
          </Text>
        )}
        {(!reportDateRange.fromDate || !reportDateRange.toDate) && (
          <Text tone="critical">
            Kies eerst een van- en totdatum.
          </Text>
        )}
        {studentsToGenerate.length === 0 ? (
          <Text tone="tertiary">
            {selectionMode === "student"
              ? "Geen leerling geselecteerd."
              : "Geen leerlingen gevonden in deze groep."}
          </Text>
        ) : (
          <Button
            variant="primary"
            onClick={() => onGenerate(studentsToGenerate, selectedTemplate, {
              coloredLevelHandsTopText,
              coloredLevelHandsBottomText,
              studentGraphsTopText,
              studentGraphsBottomText,
            })}
            disabled={
              !canAddPage || !reportDateRange.fromDate || !reportDateRange.toDate
            }
            stretch
          >
            {selectionMode === "student"
              ? "Maak 1 rapport aan →"
              : `Maak ${studentsToGenerate.length} rapporten aan →`}
          </Button>
        )}
      </Rows>

    </Rows>
  );
}

function SupportScreen({
  apiKey,
  onConnected,
  onDisconnect,
}: {
  apiKey: string;
  onConnected: (key: string) => void;
  onDisconnect: () => void;
}) {
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const connect = async () => {
    const key = input.trim();
    if (!key) return;
    setLoading(true);
    setError("");
    try {
      await apiFetch("VALIDATE", key);
      localStorage.setItem(STORAGE_KEY, key);
      onConnected(key);
    } catch {
      setError("Ongeldige koppelcode. Controleer of je de juiste code hebt gekopieerd vanuit de app.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Rows spacing="3u">
      <Rows spacing="1u">
        <Text variant="bold" size="large">Informatie & Support</Text>
        <Text>
          Gebruik deze Canva-plugin om leerlingpagina's te genereren vanuit
          MijnKleutergroep.          
        </Text>
      </Rows>

      <Rows spacing="1u">
        <Text variant="bold">MijnKleutergroep account koppelen</Text>
        {!apiKey && (
          <>
            <Rows spacing="1u">
              <Text variant="bold">Jouw koppelcode</Text>
              <TextInput
                value={input}
                onChange={(v) => {
                  setInput(v);
                  setError("");
                }}
                placeholder="u123.a9f3d8c2e1b4..."
              />
              {error && <Text tone="critical">{error}</Text>}
            </Rows>

            <Button
              variant="primary"
              onClick={connect}
              loading={loading}
              stretch
              disabled={!input.trim()}
            >
              Verbinden
            </Button>
          </>
        )}

        {apiKey && (
          <Button variant="secondary" onClick={onDisconnect} stretch>
            Ontkoppelen
          </Button>
        )}
      </Rows>
    </Rows>
  );
}

// 3. Genereer-scherm — voortgang
function GeneratingScreen({
  students,
  templateId,
  apiKey,
  reportDateRange,
  teacherName,
  reportTitle,
  reportFooter,
  selectedTapes,
  reportContentOptions,
  extraTexts,
  logoRef,
  logoAspectRatio,
  selectedBackground,
  headingFont,
  bodyFont,
  cardBgColor,
  cardBgAlpha,
  onStudentPhotoMapped,
  onStudentNameMapped,
  onDone,
  onCancel,
}: {
  students: Student[];
  templateId: Template["id"];
  apiKey: string;
  reportDateRange: ReportDateRange;
  teacherName: string;
  reportTitle: string;
  reportFooter: string;
  selectedTapes: TapeOption[];
  reportContentOptions: ReportContentOptions;
  extraTexts: PageExtraTexts;
  logoRef: ImageRef | undefined;
  logoAspectRatio: number | undefined;
  selectedBackground?: BackgroundOption;
  headingFont: SelectedFont | null;
  bodyFont: SelectedFont | null;
  cardBgColor: string;
  cardBgAlpha: number;
  onStudentPhotoMapped: (studentId: string, ref: ImageRef) => void;
  onStudentNameMapped: (studentId: string, studentName: string) => void;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [current, setCurrent] = useState(0);
  const [error, setError] = useState("");
  const [failed, setFailed] = useState<string[]>([]);
  const cancelled = React.useRef(false);

  useEffect(() => {
    let i = 0;

    const run = async () => {
      currentCardBgColor = blendWithWhite(cardBgColor, cardBgAlpha);
      const failedNames: string[] = [];

      for (const student of students) {
        if (cancelled.current) return;
        try {
          const refs = await generatePageForStudent(
            student,
            templateId,
            apiKey,
            reportDateRange,
            teacherName,
            reportTitle,
            reportFooter,
            selectedTapes,
            reportContentOptions,
            logoRef,
            logoAspectRatio,
            selectedBackground,
            headingFont,
            bodyFont,
            extraTexts,
          );
          refs.forEach((ref) => onStudentPhotoMapped(student.id, ref));
          onStudentNameMapped(student.id, student.name);
        } catch (e) {
          failedNames.push(student.name);
          setFailed([...failedNames]);
          const msg = e instanceof Error ? e.message : "Onbekende fout tijdens pagina generatie.";
          console.error(`[Genereren] Fout voor ${student.name}:`, e);
          setError(msg);
        }
        i++;
        setCurrent(i);
      }

      if (cancelled.current) {
        return;
      }

      // Als alles mislukt, blijf op dit scherm zodat de fout zichtbaar blijft.
      if (failedNames.length === students.length) {
        return;
      }

      onDone();
    };

    run();
    return () => { cancelled.current = true; };
  }, []);

  const pct = Math.round((current / students.length) * 100);
  const currentStudent = students[Math.min(current, students.length - 1)];

  return (
    <Rows spacing="3u">
      <Text variant="bold" size="large">Pagina's aanmaken…</Text>

      {/* Voortgangsbalk (handmatig, geen ProgressBar component nodig) */}
      <Rows spacing="1u">
        <div
          style={{
            height: 8,
            borderRadius: 4,
            background: "var(--ui-kit-color-surface-subtle)",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              height: "100%",
              width: `${pct}%`,
              background: "var(--ui-kit-color-brand)",
              borderRadius: 4,
              transition: "width 0.3s ease",
            }}
          />
        </div>
        <Text tone="tertiary">
          {current} / {students.length} — {currentStudent?.name ?? ""}
        </Text>
      </Rows>

      {failed.length > 0 && (
        <Rows spacing="1u">
          <Text tone="critical">
            Mislukt voor: {failed.join(", ")}
          </Text>
        </Rows>
      )}

      {error && (
        <Rows spacing="1u">
          <Text tone="critical">Fout: {error}</Text>
        </Rows>
      )}

      <Button variant="tertiary" onClick={onCancel} stretch>
        Annuleren
      </Button>
    </Rows>
  );
}

// 4. Klaar-scherm
function DoneScreen({ count, onBack }: { count: number; onBack: () => void }) {
  return (
    <Rows spacing="3u">
      <Rows spacing="1u">
        <Text variant="bold" size="large">✅ Klaar!</Text>
        <Text>
          {count} pagina's zijn aangemaakt in je Canva-document. Je kunt nu
          aanpassingen maken en daarna afdrukken via Delen → Downloaden → PDF.
        </Text>
      </Rows>
      <Button variant="primary" onClick={onBack} stretch>
        Meer rapporten genereren
      </Button>
    </Rows>
  );
}

// ─── Root app ─────────────────────────────────────────────────────────────────

export const App = () => {
  const imageSelection = useSelection("image");
  const imageSelectionCount = imageSelection?.count ?? 0;
  const isSupported = useFeatureSupport();
  const canAddPage = isSupported(addPage);
  const [apiKey, setApiKey] = useState<string>(() =>
    localStorage.getItem(STORAGE_KEY) ?? ""
  );
  const [appState, setAppState] = useState<AppState>("idle");
  const [activeTab, setActiveTab] = useState<AppTab>(
    apiKey ? "generate" : "settings",
  );
  const [generatePayload, setGeneratePayload] = useState<{
    students: Student[];
    templateId: Template["id"];
    extraTexts: PageExtraTexts;
  } | null>(null);
  const [reportDateRange, setReportDateRange] = useState<ReportDateRange>(() =>
    getStoredReportDateRange(),
  );
  const [generationError, setGenerationError] = useState<string>("");
  const [logoRef, setLogoRef] = useState<ImageRef | undefined>(undefined);
  const [logoAspectRatio, setLogoAspectRatio] = useState<number | undefined>(undefined);
  const [selectedBackground, setSelectedBackground] = useState<
    BackgroundOption | undefined
  >(() => {
    const stored = localStorage.getItem(BACKGROUND_STORAGE_KEY);
    return stored ? (JSON.parse(stored) as BackgroundOption) : undefined;
  });
  const [teacherName, setTeacherName] = useState<string>(
    () => localStorage.getItem(TEACHER_NAME_STORAGE_KEY) ?? "",
  );
  const [reportTitle, setReportTitle] = useState<string>(
    () => localStorage.getItem(REPORT_TITLE_STORAGE_KEY) ?? DEFAULT_REPORT_TITLE,
  );
  const [reportFooter, setReportFooter] = useState<string>(
    () => localStorage.getItem(REPORT_FOOTER_STORAGE_KEY) ?? "",
  );
  const [isBackgroundModalOpen, setIsBackgroundModalOpen] = useState(false);
  const [backgroundOptions, setBackgroundOptions] = useState<BackgroundOption[]>([]);
  const [backgroundsLoading, setBackgroundsLoading] = useState(false);
  const [backgroundsError, setBackgroundsError] = useState("");
  const [isTapeModalOpen, setIsTapeModalOpen] = useState(false);
  const [tapeOptions, setTapeOptions] = useState<TapeOption[]>([]);
  const [selectedTapes, setSelectedTapes] = useState<TapeOption[]>(() => {
    const stored = localStorage.getItem(TAPES_STORAGE_KEY);
    if (!stored) {
      return [];
    }

    try {
      return JSON.parse(stored) as TapeOption[];
    } catch {
      return [];
    }
  });
  const [reportContentOptions, setReportContentOptions] =
    useState<ReportContentOptions>(() => {
      const stored = localStorage.getItem(REPORT_CONTENT_STORAGE_KEY);
      if (!stored) {
        return DEFAULT_REPORT_CONTENT_OPTIONS;
      }

      try {
        const parsed = JSON.parse(stored) as Partial<ReportContentOptions>;
        return {
          ...DEFAULT_REPORT_CONTENT_OPTIONS,
          ...parsed,
          photoPage: true,
        };
      } catch {
        return DEFAULT_REPORT_CONTENT_OPTIONS;
      }
    });
  const [tapesLoading, setTapesLoading] = useState(false);
  const [tapesError, setTapesError] = useState("");
  const [tapesWarning, setTapesWarning] = useState("");
  const [headingFont, setHeadingFont] = useState<SelectedFont | null>(() =>
    getStoredSelectedFont(HEADING_FONT_STORAGE_KEY),
  );
  const [bodyFont, setBodyFont] = useState<SelectedFont | null>(() =>
    getStoredSelectedFont(BODY_FONT_STORAGE_KEY),
  );
  const [isPhotoModalOpen, setIsPhotoModalOpen] = useState(false);
  const [studentPhotos, setStudentPhotos] = useState<StudentPhoto[]>([]);
  const [studentPhotosLoading, setStudentPhotosLoading] = useState(false);
  const [studentPhotosError, setStudentPhotosError] = useState("");
  const [isNiveauModalOpen, setIsNiveauModalOpen] = useState(false);
  const [niveauOptions, setNiveauOptions] = useState<NiveauOption[]>([]);
  const [niveauOptionsLoading, setNiveauOptionsLoading] = useState(false);
  const [niveauOptionsError, setNiveauOptionsError] = useState("");
  const [selectedNiveauColor, setSelectedNiveauColor] = useState<string>("");
  const [replacingNiveauHand, setReplacingNiveauHand] = useState(false);
  const [studentSelectionOptions, setStudentSelectionOptions] = useState<Student[]>([]);
  const [studentSelectionLoading, setStudentSelectionLoading] = useState(false);
  const [replacingPhoto, setReplacingPhoto] = useState(false);
  const [cardBgColor, setCardBgColor] = useState<string>(
    () => localStorage.getItem(CARD_BG_COLOR_STORAGE_KEY) ?? "#ffffff",
  );
  const [cardBgAlpha, setCardBgAlpha] = useState<number>(
    () => parseInt(localStorage.getItem(CARD_BG_ALPHA_STORAGE_KEY) ?? "100", 10),
  );
  const handleCardBgColorChange = (color: string) => {
    setCardBgColor(color);
    localStorage.setItem(CARD_BG_COLOR_STORAGE_KEY, color);
  };
  const handleCardBgAlphaChange = (alpha: number) => {
    setCardBgAlpha(alpha);
    localStorage.setItem(CARD_BG_ALPHA_STORAGE_KEY, String(alpha));
  };
  const [selectedStudentId, setSelectedStudentId] = useState<string>("");
  const [studentPhotoRefMap, setStudentPhotoRefMap] = useState<Record<string, string>>(() => {
    const stored = localStorage.getItem(STUDENT_PHOTO_REF_MAP_STORAGE_KEY);
    if (!stored) {
      return {};
    }

    try {
      return JSON.parse(stored) as Record<string, string>;
    } catch {
      return {};
    }
  });
  const [studentNameIdMap, setStudentNameIdMap] = useState<Record<string, string>>(() => {
    const stored = localStorage.getItem(STUDENT_NAME_ID_MAP_STORAGE_KEY);
    if (!stored) {
      return {};
    }

    try {
      return JSON.parse(stored) as Record<string, string>;
    } catch {
      return {};
    }
  });
  const lastAutoHandledSelection = React.useRef("");
  const isAutoHandlingSelection = React.useRef(false);

  // Fetch and upload school logo once the API key is available
  useEffect(() => {
    if (!apiKey) return;
    let cancelled = false;
    setLogoRef(undefined);
    setLogoAspectRatio(undefined);

    fetchLogoUrl(apiKey)
      .then((url) => {
        if (!url || cancelled) return;
        return Promise.all([uploadLogo(url), resolveImageAspectRatio(url)]);
      })
      .then((result) => {
        if (!result || cancelled) return;
        const [ref, ratio] = result;
        setLogoRef(ref);
        setLogoAspectRatio(ratio);
      })
      .catch(() => {
        // Logo is non-critical; silently ignore errors
      });
    return () => { cancelled = true; };
  }, [apiKey]);

  const rememberStudentPhotoRef = (studentId: string, ref: unknown) => {
    const keys = imageRefKeys(ref);
    if (keys.length === 0 || !studentId) {
      return;
    }

    setStudentPhotoRefMap((prev) => {
      const hasAll = keys.every((key) => prev[key] === studentId);
      if (hasAll) {
        return prev;
      }

      const next = { ...prev };
      keys.forEach((key) => {
        next[key] = studentId;
      });
      localStorage.setItem(STUDENT_PHOTO_REF_MAP_STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  };

  const rememberStudentNameId = (studentId: string, studentName: string) => {
    const key = studentName.trim().toLowerCase();
    if (!key || !studentId) {
      return;
    }

    setStudentNameIdMap((prev) => {
      if (prev[key] === studentId) {
        return prev;
      }

      const next = { ...prev, [key]: studentId };
      localStorage.setItem(STUDENT_NAME_ID_MAP_STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  };

  const resolveStudentIdFromSelectedContent = (
    content: { altText?: { text?: string } | string; ref?: unknown } | undefined,
  ): string | undefined => {
    if (!content) {
      return undefined;
    }

    const refKeys = imageRefKeys(content.ref);
    for (const key of refKeys) {
      if (studentPhotoRefMap[key]) {
        return studentPhotoRefMap[key];
      }
    }

    return extractStudentIdFromSelectionContent(content);
  };

  const resolveStudentIdFromPageTitle = async (): Promise<string | undefined> => {
    const pageTitle = await getCurrentPageTitle();
    if (!pageTitle) {
      return undefined;
    }

    return studentNameIdMap[pageTitle.trim().toLowerCase()];
  };

  const resolveStudentIdFromStudentsByPageTitle = async (
    key: string,
  ): Promise<string | undefined> => {
    const pageTitle = await getCurrentPageTitle();
    const normalized = pageTitle?.trim().toLowerCase();
    if (!normalized) {
      return undefined;
    }

    const students = await fetchStudents(key);
    const match = students.find(
      (student) => student.name.trim().toLowerCase() === normalized,
    );

    if (!match) {
      return undefined;
    }

    rememberStudentNameId(match.id, match.name);
    return match.id;
  };

  const handleConnected = (key: string) => {
    setApiKey(key);
    setAppState("idle");
    setActiveTab("generate");
    setGenerationError("");
  };

  const handleDisconnect = () => {
    [
      STORAGE_KEY,
      BACKGROUND_STORAGE_KEY,
      TAPES_STORAGE_KEY,
      TEACHER_NAME_STORAGE_KEY,
      REPORT_TITLE_STORAGE_KEY,
      REPORT_FOOTER_STORAGE_KEY,
      REPORT_CONTENT_STORAGE_KEY,
      REPORT_FROM_DATE_STORAGE_KEY,
      REPORT_TO_DATE_STORAGE_KEY,
      HEADING_FONT_STORAGE_KEY,
      BODY_FONT_STORAGE_KEY,
      STUDENT_PHOTO_REF_MAP_STORAGE_KEY,
      STUDENT_NAME_ID_MAP_STORAGE_KEY,
      NIVEAU_HAND_REF_MAP_STORAGE_KEY,
    ].forEach((key) => localStorage.removeItem(key));
    niveauHandRefToColor.clear();
    setApiKey("");
    setAppState("idle");
    setActiveTab("settings");
    setGeneratePayload(null);
    setGenerationError("");
  };

  const openBackgroundPicker = async () => {
    setIsBackgroundModalOpen(true);

    if (!apiKey) {
      setBackgroundsError("Koppel eerst je account om achtergronden op te halen.");
      return;
    }

    if (backgroundOptions.length > 0) {
      return;
    }

    setBackgroundsLoading(true);
    setBackgroundsError("");

    try {
      const options = await fetchBackgrounds(apiKey);
      setBackgroundOptions(options);
    } catch {
      setBackgroundsError("Kon achtergronden niet ophalen.");
    } finally {
      setBackgroundsLoading(false);
    }
  };

  const handleBackgroundSelect = (background: BackgroundOption) => {
    setSelectedBackground(background);
    localStorage.setItem(BACKGROUND_STORAGE_KEY, JSON.stringify(background));
    setIsBackgroundModalOpen(false);
  };

  const openTapePicker = async () => {
    setIsTapeModalOpen(true);
    setTapesWarning("");

    if (!apiKey) {
      setTapesError("Koppel eerst je account om tapes op te halen.");
      return;
    }

    if (tapeOptions.length > 0) {
      return;
    }

    setTapesLoading(true);
    setTapesError("");

    try {
      const options = await fetchTapes(apiKey);
      setTapeOptions(options);
    } catch {
      setTapesError("Kon tapes niet ophalen.");
    } finally {
      setTapesLoading(false);
    }
  };

  const handleTapeToggle = (tape: TapeOption) => {
    setTapesWarning("");
    setSelectedTapes((prev) => {
      const exists = prev.some((item) => item.id === tape.id);
      if (exists) {
        const next = prev.filter((item) => item.id !== tape.id);
        localStorage.setItem(TAPES_STORAGE_KEY, JSON.stringify(next));
        return next;
      }

      if (prev.length >= 10) {
        setTapesWarning("Je kunt maximaal 10 tapes selecteren.");
        return prev;
      }

      const next = [...prev, tape];
      localStorage.setItem(TAPES_STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  };

  const handleTeacherNameChange = (name: string) => {
    setTeacherName(name);
    localStorage.setItem(TEACHER_NAME_STORAGE_KEY, name);
  };

  const handleReportTitleChange = (title: string) => {
    setReportTitle(title);
    localStorage.setItem(REPORT_TITLE_STORAGE_KEY, title);
  };

  const handleReportFooterChange = (text: string) => {
    setReportFooter(text);
    localStorage.setItem(REPORT_FOOTER_STORAGE_KEY, text);
  };

  const handleReportContentOptionChange = (
    key: keyof ReportContentOptions,
    checked: boolean,
  ) => {
    if (key === "photoPage") {
      return;
    }

    setReportContentOptions((prev) => {
      const next = {
        ...prev,
        [key]: checked,
        photoPage: true,
      };
      localStorage.setItem(REPORT_CONTENT_STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  };

  const handleReportDateRangeChange = (next: ReportDateRange) => {
    setReportDateRange(next);
  };

  useEffect(() => {
    localStorage.setItem(REPORT_FROM_DATE_STORAGE_KEY, reportDateRange.fromDate);
    localStorage.setItem(REPORT_TO_DATE_STORAGE_KEY, reportDateRange.toDate);
  }, [reportDateRange]);

  useEffect(() => {
    if (headingFont) {
      localStorage.setItem(HEADING_FONT_STORAGE_KEY, JSON.stringify(headingFont));
      return;
    }

    localStorage.removeItem(HEADING_FONT_STORAGE_KEY);
  }, [headingFont]);

  useEffect(() => {
    if (bodyFont) {
      localStorage.setItem(BODY_FONT_STORAGE_KEY, JSON.stringify(bodyFont));
      return;
    }

    localStorage.removeItem(BODY_FONT_STORAGE_KEY);
  }, [bodyFont]);

  const openStudentPhotoPicker = async () => {
    if (!apiKey) {
      setStudentPhotos([]);
      setStudentPhotosError("Koppel eerst je account om leerlingfoto's op te halen.");
      setIsPhotoModalOpen(true);
      return;
    }

    if (imageSelection.count === 0) {
      setStudentPhotos([]);
      setStudentPhotosError("Selecteer eerst een foto in je Canva-document.");
      setIsPhotoModalOpen(true);
      return;
    }

    setStudentPhotosLoading(true);
    setStudentPhotosError("");
    setStudentSelectionOptions([]);
    setStudentSelectionLoading(false);

    try {
      const draft = await imageSelection.read();
      const content = draft.contents[0] as {
        altText?: { text?: string } | string;
        ref?: unknown;
      };
      const studentId = resolveStudentIdFromSelectedContent(content);

      if (!studentId) {
        setStudentPhotos([]);
        setSelectedStudentId("");
        setStudentSelectionOptions([]);
        setStudentSelectionLoading(false);
        setStudentPhotosError(
          "Deze selectie is geen gekoppelde leerlingfoto. Selecteer een foto in een polaroid.",
        );
        setIsPhotoModalOpen(true);
        return;
      }

      const photos = await fetchStudentPhotos(apiKey, studentId);
      setSelectedStudentId(studentId);
      setStudentPhotos(photos);
      if (photos.length === 0) {
        setStudentPhotosError("Geen leerlingfoto's gevonden voor deze leerling.");
      }
      setIsPhotoModalOpen(true);
    } catch {
      setStudentPhotos([]);
      setSelectedStudentId("");
      setStudentPhotosError("Kon leerlingfoto's niet ophalen.");
      setIsPhotoModalOpen(true);
    } finally {
      setStudentPhotosLoading(false);
    }
  };

  const handleStudentSelectionForPhotos = async (student: Student) => {
    if (!apiKey) {
      return;
    }

    setStudentPhotosLoading(true);
    setStudentPhotosError("");
    try {
      rememberStudentNameId(student.id, student.name);
      const photos = await fetchStudentPhotos(apiKey, student.id);
      setSelectedStudentId(student.id);
      setStudentPhotos(photos);
      if (photos.length === 0) {
        setStudentPhotosError("Geen leerlingfoto's gevonden voor deze leerling.");
      }
    } catch {
      setStudentPhotos([]);
      setSelectedStudentId("");
      setStudentPhotosError("Kon leerlingfoto's niet ophalen.");
    } finally {
      setStudentPhotosLoading(false);
    }
  };

  const handleStudentPhotoReplace = async (photo: StudentPhoto) => {
    setReplacingPhoto(true);
    setStudentPhotosError("");
    try {
      const newRef = await uploadPhoto(photo.url);
      const draft = await imageSelection.read();
      if (draft.contents.length === 0) {
        setStudentPhotosError("Selecteer opnieuw een foto in je document.");
        return;
      }
      draft.contents.forEach((item) => {
        item.ref = newRef;
      });
      await draft.save();
      if (selectedStudentId) {
        rememberStudentPhotoRef(selectedStudentId, newRef);
      }
      setIsPhotoModalOpen(false);
    } catch {
      setStudentPhotosError("Kon de geselecteerde foto niet vervangen.");
    } finally {
      setReplacingPhoto(false);
    }
  };

  const openNiveauHandPicker = async (knownColor?: string) => {
    if (!apiKey) {
      setNiveauOptions([]);
      setNiveauOptionsError("Koppel eerst je account om niveaus op te halen.");
      setIsNiveauModalOpen(true);
      return;
    }

    if (imageSelection.count === 0) {
      setNiveauOptions([]);
      setNiveauOptionsError("Selecteer eerst een gekleurd niveauhandje in je Canva-document.");
      setIsNiveauModalOpen(true);
      return;
    }

    setNiveauOptionsLoading(true);
    setNiveauOptionsError("");

    try {
      let initialColor = knownColor;

      if (!initialColor) {
        const draft = await imageSelection.read();
        const content = draft.contents[0];

        // 1. Ref→kleur map (werkt binnen dezelfde sessie)
        if (content?.ref) {
          try { initialColor = niveauHandRefToColor.get(JSON.stringify(content.ref)); } catch {}
        }

        // 2. Metadata: altText / url / type / naam
        if (!initialColor) {
          initialColor = extractNiveauColorFromSelectionContent(content);
        }
      }

      const options = await fetchNiveaus(apiKey);
      setSelectedNiveauColor(initialColor ? normalizeNiveauColor(initialColor) : "");
      setNiveauOptions(options);
      if (!initialColor) {
        setNiveauOptionsError("Kon de huidige kleur niet bepalen — kies handmatig een kleur.");
      }
      setIsNiveauModalOpen(true);
    } catch {
      setNiveauOptions([]);
      setSelectedNiveauColor("");
      setNiveauOptionsError("Kon niveaus niet ophalen.");
      setIsNiveauModalOpen(true);
    } finally {
      setNiveauOptionsLoading(false);
    }
  };

  const handleNiveauHandReplace = async (color: string) => {
    setReplacingNiveauHand(true);
    setNiveauOptionsError("");
    try {
      const normalizedColor = normalizeNiveauColor(color);
      const newRef = await uploadNiveauHand(
        buildNiveauHandImageUrl(normalizedColor),
      );

      const draft = await imageSelection.read();
      if (draft.contents.length === 0) {
        setNiveauOptionsError("Selecteer opnieuw een niveauhandje in je document.");
        return;
      }

      draft.contents.forEach((item) => {
        item.ref = newRef;
        (item as {
          altText?: { text: string; decorative: boolean };
        }).altText = {
          text: `niveaukleur:${normalizedColor}`,
          decorative: true,
        };
      });

      await draft.save();
      setSelectedNiveauColor(normalizedColor);
      setIsNiveauModalOpen(false);
    } catch {
      setNiveauOptionsError("Kon de kleur van dit niveauhandje niet wijzigen.");
    } finally {
      setReplacingNiveauHand(false);
    }
  };

  useEffect(() => {
    if (imageSelectionCount === 0) {
      lastAutoHandledSelection.current = "";
    }
  }, [imageSelectionCount]);

  useEffect(() => {
    const autoHandleSelection = async () => {
      if (
        !apiKey ||
        appState === "generating" ||
        imageSelectionCount === 0 ||
        isPhotoModalOpen ||
        isNiveauModalOpen ||
        replacingPhoto ||
        replacingNiveauHand ||
        isAutoHandlingSelection.current
      ) {
        return;
      }

      isAutoHandlingSelection.current = true;
      try {
        const draft = await imageSelection.read();
        const content = draft.contents[0] as
          | {
              altText?: { text?: string } | string;
              ref?: unknown;
            }
          | undefined;

        if (!content) {
          return;
        }

        const marker =
          typeof content.altText === "string"
            ? content.altText
            : content.altText?.text ?? "";
        const selectionKey = JSON.stringify(content.ref ?? "") + marker;
        if (lastAutoHandledSelection.current === selectionKey) {
          return;
        }
        lastAutoHandledSelection.current = selectionKey;

        const selectedNiveauColor = extractNiveauColorFromSelectionContent(content);
        if (selectedNiveauColor) {
          await openNiveauHandPicker(selectedNiveauColor);
          return;
        }

        const selectedStudentId = resolveStudentIdFromSelectedContent(content);
        if (selectedStudentId) {
          await openStudentPhotoPicker();
        }
      } catch {
        // Geen extra melding nodig; handmatige knop blijft beschikbaar.
      } finally {
        isAutoHandlingSelection.current = false;
      }
    };

    void autoHandleSelection();
    const intervalId = window.setInterval(() => {
      void autoHandleSelection();
    }, 700);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [
    apiKey,
    appState,
    imageSelectionCount,
    imageSelection,
    isPhotoModalOpen,
    isNiveauModalOpen,
    replacingPhoto,
    replacingNiveauHand,
  ]);

  const handleGenerate = async (
    students: Student[],
    templateId: Template["id"],
    extraTexts: PageExtraTexts,
  ) => {
    if (!canAddPage) {
      setGenerationError(
        "Dit Canva-document ondersteunt geen nieuwe pagina's. Open het rapport in een documenttype dat pagina's kan toevoegen.",
      );
      return;
    }

    const pageDimensions = await getCurrentPageDimensions();
    const metadata = await getDesignMetadata();
    const dimensions = pageDimensions ?? metadata.defaultPageDimensions;

    if (!dimensions || !isA4Dimensions(dimensions.width, dimensions.height)) {
      setGenerationError(
        "Dit Canva-document is geen A4. Nieuwe pagina's nemen altijd het formaat van het huidige document over.",
      );
      return;
    } else if (!reportDateRange.fromDate || !reportDateRange.toDate) {
      setGenerationError("Kies eerst een van- en totdatum voor de rapportdata.");
      return;
    } else if (reportDateRange.fromDate > reportDateRange.toDate) {
      setGenerationError("De van-datum mag niet later zijn dan de tot-datum.");
      return;
    } else {
      setGenerationError("");
    }

    setGeneratePayload({ students, templateId, extraTexts });
    setAppState("generating");
    setActiveTab("generate");
  };

  const handleDone = () => setAppState("done");
  const handleBack = () => setAppState("idle");

  return (
    <Tabs activeId={activeTab} onSelect={(value) => setActiveTab(value as AppTab)}>
      <Box padding="2u" display="flex" flexDirection="column">
        <Box paddingBottom="1u">
          <TabList>
            <Tab
              id="settings"
              active={activeTab === "settings"}
              onClick={() => setActiveTab("settings")}
            >
              Layout
            </Tab>
            <Tab
              id="generate"
              active={activeTab === "generate"}
              onClick={() => setActiveTab("generate")}
            >
              Genereren
            </Tab>
            <Tab
              id="support"
              active={activeTab === "support"}
              onClick={() => setActiveTab("support")}
            >
              Aanpassen
            </Tab>
          </TabList>
        </Box>

        <TabPanels>
          <TabPanel id="settings">
            <SettingsScreen
              teacherName={teacherName}
              onTeacherNameChange={handleTeacherNameChange}
              reportTitle={reportTitle}
              canAddPage={canAddPage}
              onReportTitleChange={handleReportTitleChange}
              reportFooter={reportFooter}
              onReportFooterChange={handleReportFooterChange}
              selectedBackground={selectedBackground}
              onOpenBackgroundPicker={openBackgroundPicker}
              selectedTapes={selectedTapes}
              onOpenTapePicker={openTapePicker}
              reportContentOptions={reportContentOptions}
              onReportContentOptionChange={handleReportContentOptionChange}
              headingFont={headingFont}
              onHeadingFontChange={setHeadingFont}
              bodyFont={bodyFont}
              onBodyFontChange={setBodyFont}
              cardBgColor={cardBgColor}
              onCardBgColorChange={handleCardBgColorChange}
              cardBgAlpha={cardBgAlpha}
              onCardBgAlphaChange={handleCardBgAlphaChange}
            />
          </TabPanel>
          <TabPanel id="generate">
            {appState === "generating" && generatePayload ? (
              <GeneratingScreen
                students={generatePayload.students}
                templateId={generatePayload.templateId}
                apiKey={apiKey}
                reportDateRange={reportDateRange}
                teacherName={teacherName}
                reportTitle={reportTitle.trim() || DEFAULT_REPORT_TITLE}
                reportFooter={reportFooter}
                selectedTapes={selectedTapes}
                reportContentOptions={reportContentOptions}
                extraTexts={generatePayload.extraTexts}
                logoRef={logoRef}
                logoAspectRatio={logoAspectRatio}
                selectedBackground={selectedBackground}
                headingFont={headingFont}
                bodyFont={bodyFont}
                cardBgColor={cardBgColor}
                cardBgAlpha={cardBgAlpha}
                onStudentPhotoMapped={rememberStudentPhotoRef}
                onStudentNameMapped={rememberStudentNameId}
                onDone={handleDone}
                onCancel={handleBack}
              />
            ) : appState === "done" && generatePayload ? (
              <DoneScreen
                count={generatePayload.students.length}
                onBack={handleBack}
              />
            ) : (
              <GenerateScreen
                apiKey={apiKey}
                onGenerate={handleGenerate}
                generationError={generationError}
                reportContentOptions={reportContentOptions}
                onReportContentOptionChange={handleReportContentOptionChange}
                canAddPage={canAddPage}
                reportDateRange={reportDateRange}
                onReportDateRangeChange={handleReportDateRangeChange}
              />
            )}
          </TabPanel>
          <TabPanel id="support">
            <Rows spacing="3u">
              <Rows spacing="1u">
                <Text variant="bold">Vervang geselecteerde leerlingfoto</Text>
                <Text tone="tertiary">
                  Klik eerst op een leerlingfoto of niveauhandje in je Canva-document en kies daarna een nieuwe foto of kleur.
                </Text>
                <Button
                  variant="secondary"
                  onClick={openStudentPhotoPicker}
                  stretch
                  disabled={imageSelectionCount === 0}
                  loading={studentPhotosLoading}
                >
                  Kies vervangfoto
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => openNiveauHandPicker()}
                  stretch
                  disabled={imageSelectionCount === 0}
                >
                  Kleur geselecteerd handje wijzigen
                </Button>
              </Rows>
              <SupportScreen
                apiKey={apiKey}
                onConnected={handleConnected}
                onDisconnect={handleDisconnect}
              />
            </Rows>
          </TabPanel>
        </TabPanels>

        {isBackgroundModalOpen && (
          <div
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(17, 24, 39, 0.45)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: 16,
              zIndex: 1000,
            }}
          >
            <div
              style={{
                width: "100%",
                maxWidth: 720,
                maxHeight: "80vh",
                overflow: "auto",
                background: "white",
                borderRadius: 16,
                padding: 20,
              }}
            >
              <Rows spacing="2u">
                <Rows spacing="1u">
                  <Text variant="bold" size="large">Achtergrond instellen</Text>
                  <Text tone="tertiary">
                    Kies een achtergrond die gebruikt wordt voor nieuw
                    gegenereerde A4-pagina's.
                  </Text>
                </Rows>

                {backgroundsLoading ? (
                  <LoadingIndicator />
                ) : backgroundsError ? (
                  <Alert tone="critical">{backgroundsError}</Alert>
                ) : (
                  <Grid columns={2} spacing="1.5u">
                    {backgroundOptions.map((background) => (
                      <Box key={background.id}>
                        <Rows spacing="1u">
                          <ImageCard
                            ariaLabel={background.name}
                            alt={background.name}
                            thumbnailUrl={background.url}
                            onClick={() => handleBackgroundSelect(background)}
                            selectable={true}
                            selected={selectedBackground?.id === background.id}
                            borderRadius="standard"
                          />
                          <Text>{background.name}</Text>
                        </Rows>
                      </Box>
                    ))}
                  </Grid>
                )}

                <Button
                  variant="secondary"
                  onClick={() => setIsBackgroundModalOpen(false)}
                  stretch
                >
                  Sluiten
                </Button>
              </Rows>
            </div>
          </div>
        )}

        {isPhotoModalOpen && (
          <div
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(17, 24, 39, 0.45)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: 16,
              zIndex: 1000,
            }}
          >
            <div
              style={{
                width: "100%",
                maxWidth: 720,
                maxHeight: "80vh",
                overflow: "auto",
                background: "white",
                borderRadius: 16,
                padding: 20,
              }}
            >
              <Rows spacing="2u">
                <Rows spacing="1u">
                  <Text variant="bold" size="large">Leerlingfoto vervangen</Text>
                  <Text tone="tertiary">
                    {selectedStudentId
                      ? `Kies een foto voor leerling ${selectedStudentId}.`
                      : "Kies een nieuwe foto voor de geselecteerde afbeelding."}
                  </Text>
                </Rows>

                {studentPhotosLoading ? (
                  <LoadingIndicator />
                ) : studentPhotosError ? (
                  <Rows spacing="1u">
                    <Alert tone="critical">{studentPhotosError}</Alert>
                    {studentSelectionLoading ? (
                      <LoadingIndicator />
                    ) : studentSelectionOptions.length > 0 ? (
                      <Rows spacing="1u">
                        <Text variant="bold">Kies leerling</Text>
                        {studentSelectionOptions.map((student) => (
                          <Button
                            key={student.id}
                            variant="secondary"
                            onClick={() => handleStudentSelectionForPhotos(student)}
                            stretch
                          >
                            {student.name}
                          </Button>
                        ))}
                      </Rows>
                    ) : null}
                  </Rows>
                ) : (
                  <Grid columns={2} spacing="1.5u">
                    {studentPhotos.map((photo) => (
                      <Box key={String(photo.id)}>
                        <Rows spacing="1u">
                          <ImageCard
                            ariaLabel={`Leerlingfoto ${photo.id}`}
                            alt={`Leerlingfoto ${photo.id}`}
                            thumbnailUrl={photo.url}
                            onClick={() => handleStudentPhotoReplace(photo)}
                            selectable={false}
                            borderRadius="standard"
                          />
                        </Rows>
                      </Box>
                    ))}
                  </Grid>
                )}

                <Button
                  variant="secondary"
                  onClick={() => setIsPhotoModalOpen(false)}
                  stretch
                  disabled={replacingPhoto}
                >
                  Sluiten
                </Button>
              </Rows>
            </div>
          </div>
        )}

        {isNiveauModalOpen && (
          <div
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(17, 24, 39, 0.45)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: 16,
              zIndex: 1000,
            }}
          >
            <div
              style={{
                width: "100%",
                maxWidth: 720,
                maxHeight: "80vh",
                overflow: "auto",
                background: "white",
                borderRadius: 16,
                padding: 20,
              }}
            >
              <Rows spacing="2u">
                <Rows spacing="1u">
                  <Text variant="bold" size="large">Niveauhandje kleur wijzigen</Text>
                  <Text tone="tertiary">
                    Klik op een kleur om het geselecteerde niveauhandje in je document te vervangen.
                  </Text>
                </Rows>

                {niveauOptionsLoading ? (
                  <LoadingIndicator />
                ) : (
                  <>
                    {niveauOptionsError && (
                      <Alert tone={niveauOptions.length > 0 ? "info" : "critical"}>{niveauOptionsError}</Alert>
                    )}
                    {niveauOptions.length > 0 && (
                      <Grid columns={2} spacing="1.5u">
                        {niveauOptions.map((niveau) => {
                          const normalizedColor = normalizeNiveauColor(niveau.color);
                          const handUrl = buildNiveauHandImageUrl(normalizedColor);

                          return (
                            <Box key={niveau.id}>
                              <Rows spacing="1u">
                                <ImageCard
                                  ariaLabel={niveau.name}
                                  alt={niveau.name}
                                  thumbnailUrl={handUrl}
                                  onClick={() => handleNiveauHandReplace(niveau.color)}
                                  selectable={true}
                                  selected={selectedNiveauColor === normalizedColor}
                                  borderRadius="standard"
                                />
                                <Text>{niveau.name}</Text>
                              </Rows>
                            </Box>
                          );
                        })}
                      </Grid>
                    )}
                  </>
                )}

                <Button
                  variant="secondary"
                  onClick={() => setIsNiveauModalOpen(false)}
                  stretch
                  disabled={replacingNiveauHand}
                >
                  Sluiten
                </Button>
              </Rows>
            </div>
          </div>
        )}

        {isTapeModalOpen && (
          <div
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(17, 24, 39, 0.45)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: 16,
              zIndex: 1000,
            }}
          >
            <div
              style={{
                width: "100%",
                maxWidth: 720,
                maxHeight: "80vh",
                overflow: "auto",
                background: "white",
                borderRadius: 16,
                padding: 20,
              }}
            >
              <Rows spacing="2u">
                <Rows spacing="1u">
                  <Text variant="bold" size="large">Tapes kiezen</Text>
                  <Text tone="tertiary">
                    Kies maximaal 10 tapes.
                  </Text>
                </Rows>

                {tapesLoading ? (
                  <LoadingIndicator />
                ) : tapesError ? (
                  <Alert tone="critical">{tapesError}</Alert>
                ) : (
                  <Rows spacing="1u">
                    {tapesWarning && <Alert tone="warn">{tapesWarning}</Alert>}
                    <Grid columns={2} spacing="1.5u">
                      {tapeOptions.map((tape) => (
                        <Box key={tape.id}>
                          <Rows spacing="1u">
                            <ImageCard
                              ariaLabel={tape.name}
                              alt={tape.name}
                              thumbnailUrl={tape.url}
                              onClick={() => handleTapeToggle(tape)}
                              selectable={true}
                              selected={selectedTapes.some((item) => item.id === tape.id)}
                              borderRadius="standard"
                            />
                            <Text>{tape.name}</Text>
                          </Rows>
                        </Box>
                      ))}
                    </Grid>
                  </Rows>
                )}

                <Button
                  variant="secondary"
                  onClick={() => setIsTapeModalOpen(false)}
                  stretch
                >
                  Sluiten
                </Button>
              </Rows>
            </div>
          </div>
        )}
      </Box>
    </Tabs>
  );
};

/* eslint-disable no-console */
import React, { useState, useEffect } from "react";
import { FormattedMessage, useIntl } from "react-intl";
import type { IntlShape } from "react-intl";
import { auth } from "@canva/user";
import { addPage, getDesignMetadata, openDesign } from "@canva/design";
import { upload, requestFontSelection } from "@canva/asset";
import { useSelection, useFeatureSupport } from "@canva/app-hooks";
import { CanvaError } from "@canva/error";
import {
  Alert,
  Button,
  Checkbox,
  ColorSelector,
  DateInput,
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

type ValidateResponse = Record<string, unknown> & { email?: string; license_valid_until?: number };

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
const CONNECTED_EMAIL_STORAGE_KEY = "kleuterapp_connected_email";
const CARD_BG_ALPHA_STORAGE_KEY = "kleuterapp_card_bg_alpha";
const LICENCE_VALID_UNTIL_STORAGE_KEY = "kleuterapp_license_valid_until";
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

const A4_RATIO = 210 / 297;
const PAGE_H = Math.round(PAGE_W / A4_RATIO);
const uploadedBackgrounds = new Map<string, Promise<ImageRef>>();
const uploadedTapes = new Map<string, Promise<ImageRef>>();
const uploadedNiveauHands = new Map<string, Promise<ImageRef>>();
let currentCardBgColor = "#ffffff";
let currentPolaroidNoteText = "Click to add a note...";

function formatUnixDate(timestamp: number): string {
  const date = new Date(timestamp * 1000);
  return `${String(date.getDate()).padStart(2, "0")}-${String(date.getMonth() + 1).padStart(2, "0")}-${date.getFullYear()}`;
}

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
  try { localStorage.setItem(NIVEAU_HAND_REF_MAP_STORAGE_KEY, JSON.stringify([...niveauHandRefToColor])); } catch { /* ignore storage failures */ }
}
const NIVEAU_HANDS_BASE_URL =
  "https://login.mijnkleutergroep.nl/archon-content/plugins/mkg2/assets/rapporten/handjes";


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

// ─── OAuth ────────────────────────────────────────────────────────────────────

const OAUTH_SCOPE = new Set<string>([]);
const oauthClient = auth.initOauth();

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
  params?: Record<string, string | number>,
) {
  const tokenResponse = await oauthClient.getAccessToken({ scope: OAUTH_SCOPE });
  if (!tokenResponse) throw new Error("not_authenticated");
  const url = buildApiUrl(action, params);
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${tokenResponse.token}` },
  });
  const body = await res.text();
  console.log(`[apiFetch] ${action} → HTTP ${res.status}\n`, body);
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${body}`);
  }
  try {
    return JSON.parse(body);
  } catch {
    throw new Error(`HTTP ${res.status} — invalid JSON: ${body}`);
  }
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
  | { van_datum: number; tot_datum: number }
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
    const dayRaw = dmyMatch[1];
    const monthRaw = dmyMatch[2];
    const yearRaw = dmyMatch[3];
    if (!dayRaw || !monthRaw || !yearRaw) {
      return undefined;
    }
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

    const mergedEntries: [string, NiveauHandjeRow[]][] = [];

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
  const normalizedEntries: [string, NiveauHandjeRow[]][] = [];

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

async function fetchBackgrounds(): Promise<BackgroundOption[]> {
  return apiFetch("BACKGROUNDS") as Promise<BackgroundOption[]>;
}

async function fetchTapes(): Promise<TapeOption[]> {
  return apiFetch("TAPES") as Promise<TapeOption[]>;
}

async function fetchNiveaus(): Promise<NiveauOption[]> {
  return apiFetch("NIVEAUS") as Promise<NiveauOption[]>;
}

async function fetchStudentPhotos(studentId: string): Promise<StudentPhoto[]> {
  return apiFetch("LEERLINGPHOTOS", { leerling_id: studentId }) as Promise<StudentPhoto[]>;
}

async function fetchStudents(groupId?: string): Promise<Student[]> {
  const params = groupId ? { group_id: groupId } : undefined;
  return apiFetch("STUDENTS", params) as Promise<Student[]>;
}

async function fetchNiveauHandjes(
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

  const requestVariants: Record<string, string | number>[] = [];

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
    const raw = await apiFetch("NIVEAUHANDJES", params);
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
  studentId: string,
  dateRange: ReportDateRange,
): Promise<DoelomschrijvingRow[]> {
  return apiFetch("DOELOMSCHRIJVING", {
    leerling_id: studentId,
    ...buildDateRangeParams(dateRange),
  }) as Promise<DoelomschrijvingRow[]>;
}

async function fetchOntwikkelniveaus(
  studentId: string,
  dateRange: ReportDateRange,
): Promise<OntwikkelniveauRow[]> {
  return apiFetch("ONTWIKKELNIVEAUS", {
    leerling_id: studentId,
    ...buildDateRangeParams(dateRange),
  }) as Promise<OntwikkelniveauRow[]>;
}

async function fetchGroeigrafieken(
  studentId: string,
  dateRange: ReportDateRange,
): Promise<GroeigrafiekItem[]> {
  const van = toUnixTimestamp(dateRange.fromDate);
  const tot = toUnixTimestamp(dateRange.toDate, true);
  if (van == null || tot == null) return [];
  const result = await apiFetch("GROEIGRAFIEKEN", {
    leerling_id: studentId,
    van,
    tot,
  });
  return Array.isArray(result) ? (result as GroeigrafiekItem[]) : [];
}

async function fetchLogoUrl(): Promise<string | undefined> {
  const data = await apiFetch("LOGO") as { url?: string };
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
    const matchedColor = m?.[1];
    if (matchedColor) {
      return normalizeNiveauColor(matchedColor);
    }
  }

  const typed = content as { type?: string; name?: string };

  // 3. Probeer type veld
  if (typed.type && typeof typed.type === "string" && typed.type.toLowerCase().includes("handje")) {
    const m = typed.type.match(/niveauhandje-([a-z]+)/i);
    const matchedColor = m?.[1];
    if (matchedColor) return normalizeNiveauColor(matchedColor);
  }

  // 4. Probeer naam veld
  if (typed.name && typeof typed.name === "string") {
    const m = typed.name.match(/niveauhandje-([a-z]+)/i);
    const matchedColor = m?.[1];
    if (matchedColor) return normalizeNiveauColor(matchedColor);
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
    throw new Error(`Failed to fetch image (HTTP ${response.status})`);
  }
  const blob = await response.blob();
  const mimeType = blob.type || "image/jpeg";
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("Failed to process image"));
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

      reject(new Error("Failed to determine image dimensions"));
    };

    image.onerror = () => reject(new Error("Failed to load background image"));
    image.src = url;
  });
}

async function uploadPhoto(url: string): Promise<ImageRef> {
  const { dataUrl, mimeType } = url.startsWith("data:")
    ? { dataUrl: url, mimeType: (url.split(";")[0] ?? "").split(":")[1] ?? "image/jpeg" }
    : await fetchAsDataUrl(url);
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
      try { niveauHandRefToColor.set(JSON.stringify(asset.ref), colorMatch[1] ?? ""); saveNiveauHandRefMap(); } catch { /* ignore map persistence failures */ }
    }
    return asset.ref;
  });

  uploadedNiveauHands.set(url, uploadPromise);
  return uploadPromise;
}

function createPlaceholderDataUrl(): string {
  const canvas = document.createElement("canvas");
  canvas.width = 600;
  canvas.height = 600;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "data:image/gif;base64,R0lGODlhAQABAIAAAP///wAAACH5BAAAAAAALAAAAAABAAEAAAICRAEAOw==";
  ctx.fillStyle = "#efefef";
  ctx.fillRect(0, 0, 600, 600);
  return canvas.toDataURL("image/jpeg", 0.8);
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
          currentPolaroidNoteText,
        ],
        textAlign: "center",
        ...fontProps(bodyFont),
      },
    );

    if (selectedTapes.length > 0) {
      const randomTape =
        selectedTapes[Math.floor(Math.random() * selectedTapes.length)];
      if (!randomTape) {
        continue;
      }
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
  intl?: IntlShape,
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
            currentPolaroidNoteText,
          ]
        : [
            intl
              ? intl.formatMessage({
                  defaultMessage: "Type your text here...",
                  description: "Placeholder text on an empty polaroid card in generated report pages.",
                })
              : "Type your text here...",
          ],
      textAlign: "center",
      ...fontProps(bodyFont),
    });

    if (selectedTapes.length > 0) {
      const randomTape =
        selectedTapes[Math.floor(Math.random() * selectedTapes.length)];
      if (!randomTape) {
        continue;
      }
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
  intl?: IntlShape,
): Promise<ImageRef | undefined> {
  const background = await createPageBackground(selectedBackground);
  const placeholderRef = withPhoto
    ? await uploadPhoto(createPlaceholderDataUrl())
    : undefined;
  const elements = await buildExtraPolaroidPageElements(
    student,
    selectedTapes,
    withPhoto,
    placeholderRef,
    bodyFont,
    intl,
  );

  await addPageWithRetry({
    title: student.name,
    background,
    elements: [
      ...elements,
      ...buildPageFooterElements(student.name, intl),
    ],
  });

  return placeholderRef;
}

async function generateSelfDrawingPage(
  student: Student,
  selectedBackground?: BackgroundOption,
  intl?: IntlShape,
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
        children: [
          intl
            ? intl.formatMessage({
                defaultMessage: "This is me",
                description: "Title text on the self-drawing report page.",
              })
            : "This is me",
        ],
        fontSize: 18,
        fontWeight: "bold" as const,
      },
      ...buildPageFooterElements(student.name, intl),
    ],
  });
}

async function generateColoredLevelHandsPage(
  student: Student,
  dateRange: ReportDateRange,
  selectedBackground?: BackgroundOption,
  headingFont: SelectedFont | null = null,
  bodyFont: SelectedFont | null = null,
  topText = "",
  bottomText = "",
  intl?: IntlShape,
) {
  const background = await createPageBackground(selectedBackground);
  const niveauData = await fetchNiveauHandjes(student.id, dateRange);
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

  const renderRows: (| { type: "vak"; vak: string }
    | { type: "ontwikkellijn"; vak: string; ontwikkellijn: string; colors: Record<string, string> })[] = [];

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
      children: [
        intl
          ? intl.formatMessage(
              {
                defaultMessage: "Development goals of {name}",
                description: "Page title for the colored level hands page, including student name.",
              },
              { name: student.name },
            )
          : `Development goals of ${student.name}`,
      ],
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
        children: [
          intl
            ? intl.formatMessage({
                defaultMessage: "No level hands found for the selected period.",
                description: "Empty-state message when no colored level hand data exists for the selected date range.",
              })
            : "No level hands found for the selected period.",
        ],
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
          intl
            ? intl.formatMessage(
                {
                  defaultMessage: "Period: {fromDate} - {toDate}",
                  description: "Date period label shown in the empty-state of the colored level hands page.",
                },
                {
                  fromDate: dateRange.fromDate || "-",
                  toDate: dateRange.toDate || "-",
                },
              )
            : `Period: ${dateRange.fromDate || "-"} - ${dateRange.toDate || "-"}`,
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
      children: [
        intl
          ? intl.formatMessage({
              defaultMessage: "Not all development goals fit on this page.",
              description: "Warning shown when the colored level hands content overflows a single page.",
            })
          : "Not all development goals fit on this page.",
      ],
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
    elements: [...elements, ...buildPageFooterElements(student.name, intl)],
  });
}

async function generateGoalDescriptionsPage(
  student: Student,
  dateRange: ReportDateRange,
  selectedBackground?: BackgroundOption,
  headingFont: SelectedFont | null = null,
  bodyFont: SelectedFont | null = null,
  intl?: IntlShape,
) {
  const background = await createPageBackground(selectedBackground);
  const doelen = await fetchDoelomschrijvingen(student.id, dateRange);

  const panelMargin = 36;
  const panelTop = 80;
  const panelWidth = PAGE_W - panelMargin * 2;
  const panelHeight = PAGE_H - panelTop - 70;
  const contentLeft = panelMargin + 16;
  const contentWidth = panelWidth - 32;
  const maxContentBottom = panelTop + panelHeight - 16;
  const groupTitleHeight = 28;
  const itemRowHeight = 52;

  const grouped: { ontwikkellijn: string; items: DoelomschrijvingRow[] }[] = [];
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
        children: [
          intl
            ? intl.formatMessage({
                defaultMessage: "Development goals",
                description: "Page title for the development goals description page.",
              })
            : "Development goals",
        ],
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

    const title = pageIndex === 0
      ? student.name
      : intl
        ? intl.formatMessage(
            {
              defaultMessage: "{name} (goals {page})",
              description: "Title for continued development goals pages with page number.",
            },
            { name: student.name, page: pageIndex + 1 },
          )
        : `${student.name} (goals ${pageIndex + 1})`;
    await addPageWithRetry({
      title,
      background,
      elements: [...elements, ...buildPageFooterElements(student.name, intl)],
    });
    await delay(THROTTLE_MS);
    pageIndex++;
  }
}

async function generateGoalLevelsPage(
  student: Student,
  dateRange: ReportDateRange,
  selectedBackground?: BackgroundOption,
  headingFont: SelectedFont | null = null,
  bodyFont: SelectedFont | null = null,
  intl?: IntlShape,
) {
  const background = await createPageBackground(selectedBackground);
  const doelen = await fetchOntwikkelniveaus(student.id, dateRange);

  const panelMargin = 36;
  const titleTop = 40;
  const panelTop = 80;
  const panelWidth = PAGE_W - panelMargin * 2;
  const panelHeight = PAGE_H - panelTop - 70;
  const columnGap = 18;
  const contentLeft = panelMargin + 16;
  const contentWidth = panelWidth - 32;
  const columnWidth = (contentWidth - columnGap) / 2;
  const leftColX = contentLeft;
  const rightColX = leftColX + columnWidth + columnGap;
  const columnsTop = panelTop + 16;
  const colContentHeight = panelTop + panelHeight - 16 - columnsTop;

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
  const pageGroups: { left: Block[]; right: Block[] }[] = [];
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
        left: panelMargin,
        width: panelWidth,
        children: [
          intl
            ? intl.formatMessage({
                defaultMessage: "Development goal levels",
                description: "Page title for the development goal levels page.",
              })
            : "Development goal levels",
        ],
        fontSize: 26,
        fontWeight: "bold" as const,
        ...fontProps(headingFont),
      },
      createRectangleShape(panelTop, panelMargin, panelWidth, panelHeight, currentCardBgColor),
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

    const title = pageIdx === 0
      ? student.name
      : intl
        ? intl.formatMessage(
            {
              defaultMessage: "{name} (levels {page})",
              description: "Title for continued development goal levels pages with page number.",
            },
            { name: student.name, page: pageIdx + 1 },
          )
        : `${student.name} (levels ${pageIdx + 1})`;
    await addPageWithRetry({
      title,
      background,
      elements: [...elements, ...buildPageFooterElements(student.name, intl)],
    });
    await delay(THROTTLE_MS);
  }
}

async function generateGroeigrafiekenPage(
  student: Student,
  dateRange: ReportDateRange,
  selectedBackground?: BackgroundOption,
  headingFont: SelectedFont | null = null,
  bodyFont: SelectedFont | null = null,
  topText = "",
  bottomText = "",
  intl?: IntlShape,
) {
  const charts = await fetchGroeigrafieken(student.id, dateRange);
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
      ? intl
        ? intl.formatMessage(
            {
              defaultMessage: "Growth charts of {name}",
              description: "Page title for the student growth charts page.",
            },
            { name: student.name },
          )
        : `Growth charts of ${student.name}`
      : intl
        ? intl.formatMessage(
            {
              defaultMessage: "Growth charts of {name} (continued)",
              description: "Page title for continuation pages of student growth charts.",
            },
            { name: student.name },
          )
        : `Growth charts of ${student.name} (continued)`;

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
      title: pageIndex === 0 ? student.name : `${student.name} (charts ${pageIndex + 1})`,
      background,
      elements: [...elements, ...buildPageFooterElements(student.name, intl)],
    });
    await delay(THROTTLE_MS);
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
      altText: { text: "Background", decorative: true },
    },
  };
}

type SelectedFont = { ref: FontRef; name: string };

function fontProps(font: SelectedFont | null): { fontRef?: FontRef } {
  return font ? { fontRef: font.ref } : {};
}

function buildPageFooterElements(studentName: string, intl?: IntlShape) {
  return [
    {
      type: "text" as const,
      top: PAGE_H - 44,
      left: 40,
      width: PAGE_W - 80,
      children: [
        intl
          ? intl.formatMessage(
              {
                defaultMessage: "(c) MijnKleutergroep - {studentName}",
                description: "Footer text shown on generated report pages.",
              },
              { studentName },
            )
          : `(c) MijnKleutergroep - ${studentName}`,
      ],
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
  intl?: IntlShape,
): Promise<ImageRef> {
  console.log("[generateRapport] createPageBackground...");
  const background = await createPageBackground(selectedBackground);
  console.log("[generateRapport] uploadPhoto placeholder...");
  const placeholderRef = await uploadPhoto(createPlaceholderDataUrl());
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
      children: [
        intl
          ? intl.formatMessage(
              {
                defaultMessage: "Date of birth: {birthDate}",
                description: "Label for student date of birth on the generated report cover page.",
              },
              { birthDate: student.birthDate },
            )
          : `Date of birth: ${student.birthDate}`,
      ],
      ...fontProps(bodyFont),
    },
    {
      type: "text" as const,
      top: infoCardTop + 100,
      left: infoCardLeft + 160,
      width: infoCardWidth - 200,
      children: [
        intl
          ? intl.formatMessage(
              {
                defaultMessage: "Teacher: {teacherName}",
                description: "Label for teacher name on the generated report cover page.",
              },
              { teacherName: teacherName || "-" },
            )
          : `Teacher: ${teacherName || "-"}`,
      ],
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
            altText: {
              text: intl
                ? intl.formatMessage({
                    defaultMessage: "School logo",
                    description: "Decorative alt text label for the school logo on the report cover page.",
                  })
                : "School logo",
              decorative: true as const,
            },
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
    ...buildPageFooterElements(student.name, intl),
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
const THROTTLE_MS = 500;

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Tijdstip van de laatste succesvolle addPage, gebruikt voor proactieve throttling
let lastPageAddedAt = 0;

// Helper: addPage met gegarandeerd minimum interval + retry bij rate limiting
async function addPageWithRetry(page: Parameters<typeof addPage>[0], maxRetries = 6, baseDelay = 1200) {
  // Wacht tot het minimum interval verstreken is sinds de vorige pagina
  const elapsed = Date.now() - lastPageAddedAt;
  if (elapsed < THROTTLE_MS) {
    await delay(THROTTLE_MS - elapsed);
  }

  let attempt = 0;
  let lastError;
  while (attempt <= maxRetries) {
    try {
      const result = await addPage(page);
      lastPageAddedAt = Date.now();
      return result;
    } catch (e: any) {
      const errorCode = e instanceof CanvaError ? e.code : e?.code;
      const isRateLimited =
        errorCode === "rate_limited" ||
        (typeof e?.message === "string" && e.message.includes("rate_limited"));

      if (isRateLimited && attempt < maxRetries) {
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
  templateId: "rapport" | "portfolio" | "groei",
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
  intl?: IntlShape,
  extraTexts: PageExtraTexts = { coloredLevelHandsTopText: "", coloredLevelHandsBottomText: "", studentGraphsTopText: "", studentGraphsBottomText: "" },
): Promise<ImageRef[]> {
  const mappedRefs: ImageRef[] = [];
  let ref: ImageRef | undefined;

  if (templateId === "rapport") {
    if (reportContentOptions.photoPage) {
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
        intl,
      );
      mappedRefs.push(placeholderRef);
      await delay(THROTTLE_MS);
    }

    if (reportContentOptions.extraPhotosPage) {
      const extraPhotoRef = await generateExtraPolaroidPage(
        student,
        selectedTapes,
        true,
        selectedBackground,
        bodyFont,
        intl,
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
        intl,
      );
      await delay(THROTTLE_MS);
    }

    if (reportContentOptions.selfDrawing) {
      await generateSelfDrawingPage(student, selectedBackground, intl);
      await delay(THROTTLE_MS);
    }

    if (reportContentOptions.coloredLevelHands) {
      await generateColoredLevelHandsPage(student, dateRange, selectedBackground, headingFont, bodyFont, extraTexts.coloredLevelHandsTopText, extraTexts.coloredLevelHandsBottomText, intl);
      await delay(THROTTLE_MS);
    }

    if (reportContentOptions.goalDescriptions) {
      await generateGoalDescriptionsPage(student, dateRange, selectedBackground, headingFont, bodyFont, intl);
      await delay(THROTTLE_MS);
    }

    if (reportContentOptions.goalLevels) {
      await generateGoalLevelsPage(student, dateRange, selectedBackground, headingFont, bodyFont, intl);
      await delay(THROTTLE_MS);
    }

    if (reportContentOptions.studentGraphs) {
      await generateGroeigrafiekenPage(student, dateRange, selectedBackground, headingFont, bodyFont, extraTexts.studentGraphsTopText, extraTexts.studentGraphsBottomText, intl);
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
  const intl = useIntl();

  return (
    <Rows spacing="3u">
      <Rows spacing="1u">
        <Text variant="bold">
          <FormattedMessage
            
            defaultMessage="Teacher name"
            description="Label for the teacher name input field in the Settings screen"
          />
        </Text>
        <TextInput
          value={teacherName}
          onChange={onTeacherNameChange}
          placeholder={intl.formatMessage({
            
            defaultMessage: "E.g. Ms. Jansen",
            description: "Placeholder for the teacher name input, showing an example name",
          })}
        />
      </Rows>

      <Rows spacing="1u">
        <Text variant="bold">
          <FormattedMessage
            
            defaultMessage="Report title"
            description="Label for the report title input field"
          />
        </Text>
        <TextInput
          value={reportTitle}
          onChange={onReportTitleChange}
          placeholder={intl.formatMessage({
            
            defaultMessage: "Look what I can already do!",
            description: "Default report title shown as placeholder and fallback",
          })}
        />
      </Rows>

      <Rows spacing="1u">
        <Text variant="bold">
          <FormattedMessage
            
            defaultMessage="Text below report"
            description="Label for the footer text field that appears below the report"
          />
        </Text>
        <MultilineInput
          value={reportFooter}
          onChange={onReportFooterChange}
          placeholder={intl.formatMessage({
            
            defaultMessage: "Text that appears at the bottom of the 1st page in a white box (optional)",
            description: "Placeholder for the report footer text input",
          })}
          minRows={3}
        />
      </Rows>

      <Rows spacing="1u">
        <Text variant="bold">
          <FormattedMessage
            
            defaultMessage="Set background"
            description="Label for the background picker section in Settings"
          />
        </Text>
        <Text tone="tertiary">
          {selectedBackground
            ? intl.formatMessage(
                {
                  
                  defaultMessage: "Selected: {name}",
                  description: "Shows the name of the currently selected background",
                },
                { name: selectedBackground.name },
              )
            : intl.formatMessage({
                
                defaultMessage: "No background selected yet.",
                description: "Shown when no background has been chosen",
              })}
        </Text>
        <Button variant="secondary" onClick={onOpenBackgroundPicker} stretch>
          {intl.formatMessage({
            
            defaultMessage: "Set background",
            description: "Button to open the background picker",
          })}
        </Button>
      </Rows>

      <Rows spacing="1u">
        <Text variant="bold">
          <FormattedMessage
            
            defaultMessage="Choose tapes"
            description="Label for the tape picker section in Settings"
          />
        </Text>
        <Text tone="tertiary">
          {selectedTapes.length > 0
            ? intl.formatMessage(
                {
                  
                  defaultMessage: "{count} of 10 selected",
                  description: "Shows how many tapes are currently selected out of the maximum of 10",
                },
                { count: selectedTapes.length },
              )
            : intl.formatMessage({
                
                defaultMessage: "No tapes selected yet.",
                description: "Shown when no tapes have been chosen",
              })}
        </Text>
        <Button variant="secondary" onClick={onOpenTapePicker} stretch>
          {intl.formatMessage({
            
            defaultMessage: "Choose tapes",
            description: "Button to open the tape picker",
          })}
        </Button>
      </Rows>

      <Rows spacing="1u">
        <Text variant="bold">
          <FormattedMessage
            
            defaultMessage="Font for headings"
            description="Label for the heading font picker in Settings"
          />
        </Text>
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
          {headingFont
            ? headingFont.name
            : intl.formatMessage({
                
                defaultMessage: "Default (click to choose)",
                description: "Button label when no custom font has been selected yet",
              })}
        </Button>
        {headingFont && (
          <Button variant="secondary" onClick={() => onHeadingFontChange(null)}>
            {intl.formatMessage({
              
              defaultMessage: "Clear",
              description: "Button to remove the currently selected font and revert to default",
            })}
          </Button>
        )}
      </Rows>

      <Rows spacing="1u">
        <Text variant="bold">
          <FormattedMessage
            
            defaultMessage="Font for body text"
            description="Label for the body text font picker in Settings"
          />
        </Text>
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
          {bodyFont
            ? bodyFont.name
            : intl.formatMessage({
                
                defaultMessage: "Default (click to choose)",
                description: "Button label when no custom font has been selected yet",
              })}
        </Button>
        {bodyFont && (
          <Button variant="secondary" onClick={() => onBodyFontChange(null)}>
            {intl.formatMessage({
              
              defaultMessage: "Clear",
              description: "Button to remove the currently selected font and revert to default",
            })}
          </Button>
        )}
      </Rows>

      <Rows spacing="1u">
        <Text variant="bold">
          <FormattedMessage
            
            defaultMessage="Card background color"
            description="Label for the card background color picker in Settings"
          />
        </Text>
        <Text tone="tertiary">
          <FormattedMessage
            
            defaultMessage="Color of the cards and text blocks on generated pages. (default: white)"
            description="Description for the card background color setting"
          />
        </Text>
        <ColorSelector color={cardBgColor} onChange={onCardBgColorChange} />
        <Text tone="tertiary">
          {intl.formatMessage(
            {
              
              defaultMessage: "Opacity: {value}%",
              description: "Shows the current opacity percentage for the card background color",
            },
            { value: cardBgAlpha },
          )}
        </Text>
        <Slider min={0} max={100} step={1} value={cardBgAlpha} onChange={onCardBgAlphaChange} />
      </Rows>

      {/* Connection code and disconnect have been moved to the Support tab */}
    </Rows>
  );
}

// 2. Genereren
type GenerateScreenProps = {
  isAuthenticated: boolean;
  onGenerate: (students: Student[], template: "rapport", extraTexts: PageExtraTexts) => void;
  generationError?: string;
  licenseValidUntil: number | null;
  reportContentOptions: ReportContentOptions;
  onReportContentOptionChange: (key: keyof ReportContentOptions, value: boolean) => void;
  canAddPage: boolean;
  reportDateRange: ReportDateRange;
  onReportDateRangeChange: (next: ReportDateRange) => void;
};

function GenerateScreen({
  isAuthenticated,
  onGenerate,
  generationError,
  licenseValidUntil,
  reportContentOptions,
  onReportContentOptionChange,
  canAddPage,
  reportDateRange,
  onReportDateRangeChange,
}: GenerateScreenProps) {
  const intl = useIntl();
  const toDateInputValue = (value: string) => {
    const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) {
      return undefined;
    }

    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    if (!year || !month || !day) {
      return undefined;
    }

    return { year, month, day };
  };

  const fromDateInputValue = toDateInputValue(reportDateRange.fromDate);
  const toDateInputValueCurrent = toDateInputValue(reportDateRange.toDate);
  const [groups, setGroups] = useState<Group[]>([]);
  const [groupStudents, setGroupStudents] = useState<Student[]>([]);
  const [allStudents, setAllStudents] = useState<Student[]>([]);
  const [selectionMode, setSelectionMode] = useState<"group" | "student">("student");
  const [selectedGroup, setSelectedGroup] = useState<string>("");
  const [selectedStudentId, setSelectedStudentId] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [coloredLevelHandsTopText, setColoredLevelHandsTopText] = useState("");
  const [coloredLevelHandsBottomText, setColoredLevelHandsBottomText] = useState("");
  const [studentGraphsTopText, setStudentGraphsTopText] = useState("");
  const [studentGraphsBottomText, setStudentGraphsBottomText] = useState("");

  useEffect(() => {
    if (!isAuthenticated) {
      setGroups([]);
      setGroupStudents([]);
      setAllStudents([]);
      setSelectionMode("student");
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
          apiFetch("GROUPS") as Promise<Group[]>,
          fetchStudents("0"),
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
      } catch (err) {
        const detail = err instanceof Error ? err.message : String(err);
        setLoadError(
          intl.formatMessage({
            
            defaultMessage: "Could not retrieve data. Check your connection.",
            description: "Error shown when the app fails to load groups and students",
          }) + (detail ? ` (${detail})` : "")
        );
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [isAuthenticated]);

  useEffect(() => {
    if (!isAuthenticated || !selectedGroup) {
      setGroupStudents([]);
      return;
    }

    let cancelled = false;

    const loadGroupStudents = async () => {
      try {
        const studentData = await fetchStudents(selectedGroup);
        if (!cancelled) {
          setGroupStudents(studentData);
        }
      } catch {
        if (!cancelled) {
          setGroupStudents([]);
          setLoadError(intl.formatMessage({
            
            defaultMessage: "Something went wrong while loading the students. Please try again later.",
            description: "Error shown when loading students for a selected class fails",
          }));
        }
      }
    };

    loadGroupStudents();

    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, selectedGroup]);

  const selectedStudent = allStudents.find((student) => student.id === selectedStudentId);
  const studentsToGenerate =
    selectionMode === "student"
      ? selectedStudent
        ? [selectedStudent]
        : []
      : groupStudents;
  const licenseExpired = licenseValidUntil != null && licenseValidUntil < Math.floor(Date.now() / 1000);

  if (loading) return <LoadingIndicator />;
  if (!isAuthenticated) {
    return (
      <Rows spacing="2u">
        <Text variant="bold" size="large">
          <FormattedMessage
            
            defaultMessage="Generate"
            description="Title of the Generate tab"
          />
        </Text>
        <Text tone="tertiary">
          <FormattedMessage
            
            defaultMessage="First connect your account in the Customize tab to generate pages."
            description="Message shown when the user has not connected their account yet"
          />
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

      {/* Step 1 — Group/student selection */}
      <Rows spacing="1u">
        <Text variant="bold">
          <FormattedMessage
            
            defaultMessage="① Choose what you want to generate"
            description="Heading for step 1 of the generate flow"
          />
        </Text>
        <RadioGroup
          value={selectionMode}
          onChange={(value) => setSelectionMode(value as "group" | "student")}
          options={[
            {
              value: "student",
              label: intl.formatMessage({
                
                defaultMessage: "An individual student",
                description: "Radio option to generate a report for one student",
              }),
              description: intl.formatMessage({
                
                defaultMessage: "Generate 1 individual report",
                description: "Description for the 'individual student' radio option",
              }),
            },
            {
              value: "group",
              label: intl.formatMessage({
                
                defaultMessage: "An entire class",
                description: "Radio option to generate reports for a whole class",
              }),
              description: intl.formatMessage({
                
                defaultMessage: "Generate for all students in 1 class",
                description: "Description for the 'entire class' radio option",
              }),
            },
          ]}
        />

        {selectionMode === "group" ? (
          <>
            <Text variant="bold">
              <FormattedMessage
                
                defaultMessage="Choose a class"
                description="Label above the class selection radio group"
              />
            </Text>
            {groups.length === 0 ? (
              <Alert tone="info">
                <FormattedMessage
                  
                  defaultMessage="No classes found. Make sure your account is linked and that there are classes available in MijnKleutergroep."
                  description="Alert shown when no groups/classes are found after loading"
                />
              </Alert>
            ) : (
              <RadioGroup
                value={selectedGroup}
                onChange={setSelectedGroup}
                options={groups.map((g) => ({
                  value: g.id,
                  label: g.name,
                  description: intl.formatMessage(
                    {
                      
                      defaultMessage: "{count} students",
                      description: "Shows the number of students in a class",
                    },
                    { count: g.studentCount },
                  ),
                }))}
              />
            )}
          </>
        ) : (
          <>
            <Text variant="bold">
              <FormattedMessage
                
                defaultMessage="Choose a student"
                description="Label above the student selection radio group"
              />
            </Text>
            {allStudents.length === 0 ? (
              <Alert tone="info">
                <FormattedMessage
                  
                  defaultMessage="No students found. Make sure your account is linked and that there are students available in MijnKleutergroep."
                  description="Alert shown when no students are found after loading"
                />
              </Alert>
            ) : (
              <RadioGroup
                value={selectedStudentId}
                onChange={setSelectedStudentId}
                options={allStudents.map((student) => ({
                  value: student.id,
                  label: student.name,
                  description: student.group,
                }))}
              />
            )}
          </>
        )}
      </Rows>

      {/* Step 2 — Date range */}
      <Rows spacing="1u">
        <Text variant="bold">
          <FormattedMessage
            
            defaultMessage="② From and to date"
            description="Heading for step 2 of the generate flow"
          />
        </Text>
        <Text tone="tertiary">
          <FormattedMessage
            
            defaultMessage="These dates are used to calculate the achieved levels."
            description="Explanation of why the date range is needed"
          />
        </Text>
        <Grid columns={2} spacing="1.5u">
          <label style={{ display: "grid", gap: 6 }}>
            <Text variant="bold">
              <FormattedMessage
                
                defaultMessage="From date"
                description="Label for the start date input"
              />
            </Text>
            <DateInput
              mode="date"
              value={fromDateInputValue}
              onChange={(value) =>
                onReportDateRangeChange({
                  ...reportDateRange,
                  fromDate: value
                    ? `${String(value.year).padStart(4, "0")}-${String(value.month).padStart(2, "0")}-${String(value.day).padStart(2, "0")}`
                    : "",
                })
              }
              ariaLabel={intl.formatMessage({
                
                defaultMessage: "From date",
                description: "Label for the start date input",
              })}
            />
          </label>
          <label style={{ display: "grid", gap: 6 }}>
            <Text variant="bold">
              <FormattedMessage
                
                defaultMessage="To date"
                description="Label for the end date input"
              />
            </Text>
            <DateInput
              mode="date"
              value={toDateInputValueCurrent}
              onChange={(value) =>
                onReportDateRangeChange({
                  ...reportDateRange,
                  toDate: value
                    ? `${String(value.year).padStart(4, "0")}-${String(value.month).padStart(2, "0")}-${String(value.day).padStart(2, "0")}`
                    : "",
                })
              }
              ariaLabel={intl.formatMessage({
                
                defaultMessage: "To date",
                description: "Label for the end date input",
              })}
            />
          </label>
        </Grid>
      </Rows>

      {/* Step 3 — Report content */}
      <Rows spacing="1u">
        <Box paddingTop="2u">
        <Rows spacing="1u">
          <Text variant="bold">
            <FormattedMessage
              
              defaultMessage="Report content per student"
              description="Heading above the checkboxes for selecting which pages to include in the report"
            />
          </Text>
          <Checkbox
            label={intl.formatMessage({
              
              defaultMessage: "Cover page (photo page)",
              description: "Checkbox label for the cover/photo page option",
            })}
            checked={reportContentOptions.photoPage}
            onChange={(_, checked) =>
              onReportContentOptionChange("photoPage", checked)
            }
          />
          <Checkbox
            label={intl.formatMessage({
              
              defaultMessage: "Extra page with 6 photos",
              description: "Checkbox label for the extra photos page option",
            })}
            checked={reportContentOptions.extraPhotosPage}
            onChange={(_, checked) =>
              onReportContentOptionChange("extraPhotosPage", checked)
            }
          />
          <Checkbox
            label={intl.formatMessage({
              
              defaultMessage: "Extra page with 6 text boxes",
              description: "Checkbox label for the extra text boxes page option",
            })}
            checked={reportContentOptions.extraTextBoxesPage}
            onChange={(_, checked) =>
              onReportContentOptionChange("extraTextBoxesPage", checked)
            }
          />
          <Checkbox
            label={intl.formatMessage({
              
              defaultMessage: "Colored level hands",
              description: "Checkbox label for the colored level hands page option",
            })}
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
                  placeholder={intl.formatMessage({
                    
                    defaultMessage: "Text above the page (optional)",
                    description: "Placeholder for optional text shown above the level hands page",
                  })}
                />
                <MultilineInput
                  value={coloredLevelHandsBottomText}
                  onChange={setColoredLevelHandsBottomText}
                  placeholder={intl.formatMessage({
                    
                    defaultMessage: "Text below the page (optional)",
                    description: "Placeholder for optional text shown below the level hands page",
                  })}
                />
              </Rows>
            </Box>
          )}
          <Checkbox
            label={intl.formatMessage({
              
              defaultMessage: "Student graphs",
              description: "Checkbox label for the student growth graphs page option",
            })}
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
                  placeholder={intl.formatMessage({
                    
                    defaultMessage: "Text above the page (optional)",
                    description: "Placeholder for optional text shown above the level hands page",
                  })}
                />
                <MultilineInput
                  value={studentGraphsBottomText}
                  onChange={setStudentGraphsBottomText}
                  placeholder={intl.formatMessage({
                    
                    defaultMessage: "Text below the page (optional)",
                    description: "Placeholder for optional text shown below the level hands page",
                  })}
                />
              </Rows>
            </Box>
          )}
          <Checkbox
            label={intl.formatMessage({
              
              defaultMessage: "Self-drawing",
              description: "Checkbox label for the self-drawing page option",
            })}
            checked={reportContentOptions.selfDrawing}
            onChange={(_, checked) =>
              onReportContentOptionChange("selfDrawing", checked)
            }
          />
          <Checkbox
            label={intl.formatMessage({
              
              defaultMessage: "Goal level with description",
              description: "Checkbox label for the goal level with description page option",
            })}
            checked={reportContentOptions.goalDescriptions}
            onChange={(_, checked) =>
              onReportContentOptionChange("goalDescriptions", checked)
            }
          />
          <Checkbox
            label={intl.formatMessage({
              
              defaultMessage: "Development goals with levels",
              description: "Checkbox label for the development goals with levels page option",
            })}
            checked={reportContentOptions.goalLevels}
            onChange={(_, checked) =>
              onReportContentOptionChange("goalLevels", checked)
            }
          />
        </Rows>
        </Box>
      </Rows>

      {/* Step 4 — Generate */}
      <Rows spacing="1u">
        <Text variant="bold">
          <FormattedMessage
            
            defaultMessage="③ Generate pages"
            description="Heading for step 4 of the generate flow"
          />
        </Text>
        {generationError && <Alert tone="warn">{generationError}</Alert>}
        {!canAddPage && (
          <Text tone="critical">
            <FormattedMessage
              
              defaultMessage="This Canva document doesn't support new pages. Open the report in a document type that can add pages."
              description="Error shown when the current Canva document type does not support adding pages"
            />
          </Text>
        )}
        {(!reportDateRange.fromDate || !reportDateRange.toDate) && (
          <Text tone="critical">
            <FormattedMessage
              
              defaultMessage="First choose a from and to date."
              description="Error shown when the user has not selected a date range yet"
            />
          </Text>
        )}
        {licenseExpired ? (
          <Alert tone="warn">
            {intl.formatMessage({
              
              defaultMessage: "Your custom report licence has expired, renew your licence in MijnKleutergroep.",
              description: "Warning shown instead of the generate button when the user's custom report licence has expired. 'MijnKleutergroep' is a proper name — do not translate.",
            })}
          </Alert>
        ) : studentsToGenerate.length === 0 ? (
          <Text tone="tertiary">
            {selectionMode === "student"
              ? intl.formatMessage({
                  
                  defaultMessage: "No student selected.",
                  description: "Shown when no individual student has been chosen",
                })
              : intl.formatMessage({
                  
                  defaultMessage: "No students found in this class.",
                  description: "Shown when the selected class has no students",
                })}
          </Text>
        ) : (
          <Button
            variant="primary"
            onClick={() => onGenerate(studentsToGenerate, "rapport", {
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
              ? intl.formatMessage({
                  
                  defaultMessage: "Create 1 report →",
                  description: "Button to generate a report for the selected individual student",
                })
              : intl.formatMessage(
                  {
                    
                    defaultMessage: "Create {count} reports →",
                    description: "Button to generate reports for all students in the selected class",
                  },
                  { count: studentsToGenerate.length },
                )}
          </Button>
        )}
      </Rows>

    </Rows>
  );
}

function SupportScreen({
  isAuthenticated,
  connectedEmail,
  licenseValidUntil,
  onLogin,
}: {
  isAuthenticated: boolean;
  connectedEmail: string;
  licenseValidUntil: number | null;
  onLogin: () => Promise<void>;
}) {
  const intl = useIntl();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleLogin = async () => {
    setLoading(true);
    setError("");
    try {
      await onLogin();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  const licenseExpired = licenseValidUntil != null && licenseValidUntil < Math.floor(Date.now() / 1000);

  return (
    <Rows spacing="3u">
      <Rows spacing="1u">
        <Text variant="bold" size="large">
          <FormattedMessage
            
            defaultMessage="Information & Support"
            description="Title of the Support tab"
          />
        </Text>
        <Text>
          <FormattedMessage
            
            defaultMessage="Use this Canva plugin to generate student pages from MijnKleutergroep."
            description="Short description of what this plugin does, shown in the Support tab"
          />
        </Text>
      </Rows>

      <Rows spacing="1u">
        <Text variant="bold">
          <FormattedMessage
            
            defaultMessage="Connect MijnKleutergroep account"
            description="Heading for the account connection section"
          />
        </Text>
        {!isAuthenticated ? (
          <>
            <Button variant="primary" onClick={handleLogin} loading={loading} stretch>
              {intl.formatMessage({
                
                defaultMessage: "Log in with MijnKleutergroep",
                description: "Button to start the OAuth login flow",
              })}
            </Button>
            {error && <Alert tone="critical">{error}</Alert>}
          </>
        ) : (
          <>
            <Text tone="tertiary">
              {intl.formatMessage(
                {
                  
                  defaultMessage: "Connected as {email}",
                  description: "Text shown when an account is connected",
                },
                { email: connectedEmail || "-" },
              )}
            </Text>
            {licenseValidUntil != null && (
              <Alert tone={licenseExpired ? "warn" : "positive"}>
                {intl.formatMessage(
                  {
                    
                    defaultMessage: "Licence valid until: {date}",
                    description: "Shows the license validity date in the Support tab",
                  },
                  { date: formatUnixDate(licenseValidUntil) },
                )}
              </Alert>
            )}
          </>
        )}
      </Rows>
    </Rows>
  );
}

function GeneratingScreen({
  students,
  templateId,
  reportDateRange,
  teacherName,
  reportTitle,
  reportFooter,
  selectedTapes,
  reportContentOptions,
  extraTexts,
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
  templateId: "rapport";
  reportDateRange: ReportDateRange;
  teacherName: string;
  reportTitle: string;
  reportFooter: string;
  selectedTapes: TapeOption[];
  reportContentOptions: ReportContentOptions;
  extraTexts: PageExtraTexts;
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
  const intl = useIntl();

  useEffect(() => {
    let i = 0;

    const run = async () => {
      currentCardBgColor = blendWithWhite(cardBgColor, cardBgAlpha);
      currentPolaroidNoteText = intl.formatMessage({
        
        defaultMessage: "Click to add a note...",
        description: "Placeholder text in the note area of each polaroid card on a generated report page.",
      });
      const failedNames: string[] = [];

      let resolvedLogoRef: ImageRef | undefined;
      let resolvedLogoAspectRatio: number | undefined;
      try {
        const url = await fetchLogoUrl();
        if (url) {
          [resolvedLogoRef, resolvedLogoAspectRatio] = await Promise.all([
            uploadLogo(url),
            resolveImageAspectRatio(url),
          ]);
        }
      } catch {
        // Logo is non-critical; silently ignore errors
      }

      for (const student of students) {
        if (cancelled.current) return;
        try {
          const refs = await generatePageForStudent(
            student,
            templateId,
            reportDateRange,
            teacherName,
            reportTitle,
            reportFooter,
            selectedTapes,
            reportContentOptions,
            resolvedLogoRef,
            resolvedLogoAspectRatio,
            selectedBackground,
            headingFont,
            bodyFont,
            intl,
            extraTexts,
          );
          refs.forEach((ref) => onStudentPhotoMapped(student.id, ref));
          onStudentNameMapped(student.id, student.name);
        } catch (e) {
          failedNames.push(student.name);
          setFailed([...failedNames]);
          const msg = e instanceof Error ? e.message : intl.formatMessage({
            
            defaultMessage: "Something went wrong while creating this report. Please try again.",
            description: "Fallback error message shown when an unexpected error occurs during report generation and no specific error message is available.",
          });
          console.error(`[Generate] Error for ${student.name}:`, e);
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
      <Text variant="bold" size="large">
        <FormattedMessage
          
          defaultMessage="Creating pages…"
          description="Title shown while reports are being generated"
        />
      </Text>

      {/* Progress bar */}
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
          {intl.formatMessage(
            {
              defaultMessage: "{current} / {total} - {name}",
              description: "Progress text shown while generating report pages",
            },
            {
              current,
              total: students.length,
              name: currentStudent?.name ?? "",
            },
          )}
        </Text>
      </Rows>

      {failed.length > 0 && (
        <Rows spacing="1u">
          <Text tone="critical">
            {intl.formatMessage(
              {
                
                defaultMessage: "Failed for: {names}",
                description: "Error listing the students whose pages could not be generated",
              },
              { names: failed.join(", ") },
            )}
          </Text>
        </Rows>
      )}

      {error && (
        <Rows spacing="1u">
          <Text tone="critical">
            {intl.formatMessage(
              {
                
                defaultMessage: "Error: {error}",
                description: "Generic error message shown during page generation",
              },
              { error },
            )}
          </Text>
        </Rows>
      )}

      <Button variant="tertiary" onClick={onCancel} stretch>
        {intl.formatMessage({
          
          defaultMessage: "Cancel",
          description: "Button to cancel the page generation process",
        })}
      </Button>
    </Rows>
  );
}

// 4. Done screen
function DoneScreen({ count, onBack }: { count: number; onBack: () => void }) {
  const intl = useIntl();
  useEffect(() => {
    const timer = setTimeout(onBack, 4000);
    return () => clearTimeout(timer);
  }, [onBack]);
  return (
    <Rows spacing="3u">
      <Alert tone="positive">
        {intl.formatMessage(
          {
            defaultMessage: "Done! {count} pages have been created in your Canva document. You can now make changes and then print via Share -> Download -> PDF.",
            description: "Success message shown after generating reports, including completed page count and next steps",
          },
          { count },
        )}
      </Alert>
      <Button variant="primary" onClick={onBack} stretch>
        {intl.formatMessage({
          
          defaultMessage: "Generate more reports",
          description: "Button to go back and generate more reports",
        })}
      </Button>
    </Rows>
  );
}

// ─── Root app ─────────────────────────────────────────────────────────────────

export const App = () => {
  const intl = useIntl();
  const imageSelection = useSelection("image");
  const imageSelectionCount = imageSelection?.count ?? 0;
  const isSupported = useFeatureSupport();
  const canAddPage = isSupported(addPage);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [connectedEmail, setConnectedEmail] = useState<string>(
    () => localStorage.getItem(CONNECTED_EMAIL_STORAGE_KEY) ?? "",
  );
  const [licenseValidUntil, setLicenseValidUntil] = useState<number | null>(() => {
    const stored = localStorage.getItem(LICENCE_VALID_UNTIL_STORAGE_KEY);
    return stored ? parseInt(stored, 10) : null;
  });
  const [appState, setAppState] = useState<AppState>("idle");
  const [activeTab, setActiveTab] = useState<AppTab>("settings");

  // Controleer bij opstarten of de gebruiker al is ingelogd
  useEffect(() => {
    oauthClient.getAccessToken({ scope: OAUTH_SCOPE })
      .then(async (token) => {
        if (token) {
          setIsAuthenticated(true);
          setActiveTab("generate");
          try {
            const info = await apiFetch("VALIDATE") as ValidateResponse;
            const email = info.email ?? "";
            localStorage.setItem(CONNECTED_EMAIL_STORAGE_KEY, email);
            setConnectedEmail(email);
            if (typeof info.license_valid_until === "number") {
              localStorage.setItem(LICENCE_VALID_UNTIL_STORAGE_KEY, String(info.license_valid_until));
              setLicenseValidUntil(info.license_valid_until);
            }
          } catch { /* e-mail ophalen mislukt, niet kritiek */ }
        }
      })
      .catch(() => {/* niet ingelogd */});
  }, []);
  const [generatePayload, setGeneratePayload] = useState<{
    students: Student[];
    templateId: "rapport";
    extraTexts: PageExtraTexts;
  } | null>(null);
  const [reportDateRange, setReportDateRange] = useState<ReportDateRange>(() =>
    getStoredReportDateRange(),
  );
  const [generationError, setGenerationError] = useState<string>("");
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
    () => localStorage.getItem(REPORT_TITLE_STORAGE_KEY) ?? intl.formatMessage({
      
      defaultMessage: "Look what I can already do!",
      description: "Default report title shown as placeholder and fallback",
    }),
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

  const _resolveStudentIdFromPageTitle = async (): Promise<string | undefined> => {
    const pageTitle = await getCurrentPageTitle();
    if (!pageTitle) {
      return undefined;
    }

    return studentNameIdMap[pageTitle.trim().toLowerCase()];
  };

  const _resolveStudentIdFromStudentsByPageTitle = async (): Promise<string | undefined> => {
    const pageTitle = await getCurrentPageTitle();
    const normalized = pageTitle?.trim().toLowerCase();
    if (!normalized) {
      return undefined;
    }

    const students = await fetchStudents();
    const match = students.find(
      (student) => student.name.trim().toLowerCase() === normalized,
    );

    if (!match) {
      return undefined;
    }

    rememberStudentNameId(match.id, match.name);
    return match.id;
  };

  const handleLogin = async () => {
    try {
      await oauthClient.requestAuthorization({ scope: OAUTH_SCOPE });
    } catch (e) {
      const code = e instanceof CanvaError ? e.code : undefined;
      if (code === "permission_denied") {
        throw new Error(intl.formatMessage({
          
          defaultMessage: "Login was cancelled. Please try again.",
          description: "Error shown when the user cancels or denies the OAuth login flow",
        }));
      }
      throw new Error(intl.formatMessage({
        
        defaultMessage: "Login failed. Please try again.",
        description: "Error shown when the OAuth login flow completes but no access token is returned",
      }));
    }
    const token = await oauthClient.getAccessToken({ scope: OAUTH_SCOPE });
    if (!token) {
      throw new Error(intl.formatMessage({
        
        defaultMessage: "Login failed. Please try again.",
        description: "Error shown when the OAuth login flow completes but no access token is returned",
      }));
    }
    try {
      const info = await apiFetch("VALIDATE") as ValidateResponse;
      const email = info.email ?? "";
      localStorage.setItem(CONNECTED_EMAIL_STORAGE_KEY, email);
      setConnectedEmail(email);
      if (typeof info.license_valid_until === "number") {
        localStorage.setItem(LICENCE_VALID_UNTIL_STORAGE_KEY, String(info.license_valid_until));
        setLicenseValidUntil(info.license_valid_until);
      }
    } catch { /* e-mail ophalen mislukt, niet kritiek */ }
    setIsAuthenticated(true);
    setAppState("idle");
    setActiveTab("generate");
    setGenerationError("");
  };

  const openBackgroundPicker = async () => {
    setIsBackgroundModalOpen(true);

    if (!isAuthenticated) {
      setBackgroundsError(intl.formatMessage({
        
        defaultMessage: "Connect your account first to load backgrounds.",
        description: "Error shown when trying to open the background picker without a connected account",
      }));
      return;
    }

    if (backgroundOptions.length > 0) {
      return;
    }

    setBackgroundsLoading(true);
    setBackgroundsError("");

    try {
      const options = await fetchBackgrounds();
      setBackgroundOptions(options);
    } catch {
      setBackgroundsError(intl.formatMessage({
        
        defaultMessage: "Could not load backgrounds.",
        description: "Error shown when the background images fail to load",
      }));
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

    if (!isAuthenticated) {
      setTapesError(intl.formatMessage({
        
        defaultMessage: "Connect your account first to load tapes.",
        description: "Error shown when trying to open the tape picker without a connected account",
      }));
      return;
    }

    if (tapeOptions.length > 0) {
      return;
    }

    setTapesLoading(true);
    setTapesError("");

    try {
      const options = await fetchTapes();
      setTapeOptions(options);
    } catch {
      setTapesError(intl.formatMessage({
        
        defaultMessage: "Could not load tapes.",
        description: "Error shown when the tape images fail to load",
      }));
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
        setTapesWarning(intl.formatMessage({
          
          defaultMessage: "You can select a maximum of 10 tapes.",
          description: "Warning shown when the user tries to select more than 10 tapes",
        }));
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
    setReportContentOptions((prev) => {
      const next = { ...prev, [key]: checked };
      const anyChecked = Object.values(next).some(Boolean);
      if (!anyChecked) return prev;
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
    if (!isAuthenticated) {
      setStudentPhotos([]);
      setStudentPhotosError(intl.formatMessage({
        
        defaultMessage: "Connect your account first to load student photos.",
        description: "Error shown when opening the photo picker without a connected account",
      }));
      setIsPhotoModalOpen(true);
      return;
    }

    if (imageSelection.count === 0) {
      setStudentPhotos([]);
      setStudentPhotosError(intl.formatMessage({
        
        defaultMessage: "First select a photo in your Canva document.",
        description: "Error shown when the user opens the photo picker without selecting an image first",
      }));
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
        setStudentPhotosError(intl.formatMessage({
          
          defaultMessage: "This selection is not a linked student photo. Select a photo inside a polaroid.",
          description: "Error shown when the selected image is not recognized as a student photo",
        }));
        setIsPhotoModalOpen(true);
        return;
      }

      const photos = await fetchStudentPhotos(studentId);
      setSelectedStudentId(studentId);
      setStudentPhotos(photos);
      if (photos.length === 0) {
        setStudentPhotosError(intl.formatMessage({
          
          defaultMessage: "No student photos found for this student.",
          description: "Shown when a student has no photos available",
        }));
      }
      setIsPhotoModalOpen(true);
    } catch {
      setStudentPhotos([]);
      setSelectedStudentId("");
      setStudentPhotosError(intl.formatMessage({
        
        defaultMessage: "Could not load student photos.",
        description: "Error shown when the student photos fail to load",
      }));
      setIsPhotoModalOpen(true);
    } finally {
      setStudentPhotosLoading(false);
    }
  };

  const handleStudentSelectionForPhotos = async (student: Student) => {
    if (!isAuthenticated) {
      return;
    }

    setStudentPhotosLoading(true);
    setStudentPhotosError("");
    try {
      rememberStudentNameId(student.id, student.name);
      const photos = await fetchStudentPhotos(student.id);
      setSelectedStudentId(student.id);
      setStudentPhotos(photos);
      if (photos.length === 0) {
        setStudentPhotosError(intl.formatMessage({
          
          defaultMessage: "No student photos found for this student.",
          description: "Shown when a student has no photos available",
        }));
      }
    } catch {
      setStudentPhotos([]);
      setSelectedStudentId("");
      setStudentPhotosError(intl.formatMessage({
        
        defaultMessage: "Could not load student photos.",
        description: "Error shown when the student photos fail to load",
      }));
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
        setStudentPhotosError(intl.formatMessage({
          
          defaultMessage: "Please select a photo in your document again.",
          description: "Error asking the user to re-select a photo in the Canva document",
        }));
        return;
      }
      draft.contents.forEach((item) => {
        item.ref = newRef;
      });
      await draft.save();
      if (selectedStudentId) {
        rememberStudentPhotoRef(selectedStudentId, newRef);
      }

      // Voorkom dat de auto-handler de popup direct heropent voor de nieuwe ref
      lastAutoHandledSelection.current = JSON.stringify(newRef);

      setIsPhotoModalOpen(false);
    } catch {
      setStudentPhotosError(intl.formatMessage({
        
        defaultMessage: "Could not replace the selected photo.",
        description: "Error shown when replacing a student photo fails",
      }));
    } finally {
      setReplacingPhoto(false);
    }
  };

  const openNiveauHandPicker = async (knownColor?: string) => {
    if (!isAuthenticated) {
      setNiveauOptions([]);
      setNiveauOptionsError(intl.formatMessage({
        
        defaultMessage: "Connect your account first to load levels.",
        description: "Error shown when opening the level hand picker without a connected account",
      }));
      setIsNiveauModalOpen(true);
      return;
    }

    if (imageSelection.count === 0) {
      setNiveauOptions([]);
      setNiveauOptionsError(intl.formatMessage({
        
        defaultMessage: "First select a colored level hand in your Canva document.",
        description: "Error shown when the user opens the level picker without selecting an image first",
      }));
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
          try { initialColor = niveauHandRefToColor.get(JSON.stringify(content.ref)); } catch { /* ignore ref lookup failures */ }
        }

        // 2. Metadata: altText / url / type / naam
        if (!initialColor) {
          initialColor = extractNiveauColorFromSelectionContent(content);
        }
      }

      const options = await fetchNiveaus();
      setSelectedNiveauColor(initialColor ? normalizeNiveauColor(initialColor) : "");
      setNiveauOptions(options);
      if (!initialColor) {
        setNiveauOptionsError(intl.formatMessage({
          
          defaultMessage: "Could not determine the current color — please choose a color manually.",
          description: "Warning shown when the current level hand color cannot be detected automatically",
        }));
      }
      setIsNiveauModalOpen(true);
    } catch {
      setNiveauOptions([]);
      setSelectedNiveauColor("");
      setNiveauOptionsError(intl.formatMessage({
        
        defaultMessage: "Could not load levels.",
        description: "Error shown when the level options fail to load",
      }));
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
        setNiveauOptionsError(intl.formatMessage({
          
          defaultMessage: "Please select a level hand in your document again.",
          description: "Error asking the user to re-select a level hand in the Canva document",
        }));
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

      // Voorkom dat de auto-handler de popup direct heropent voor de nieuwe ref
      lastAutoHandledSelection.current = JSON.stringify(newRef);

      setSelectedNiveauColor(normalizedColor);
      setIsNiveauModalOpen(false);
    } catch {
      setNiveauOptionsError(intl.formatMessage({
        
        defaultMessage: "Could not change the color of this level hand.",
        description: "Error shown when replacing a level hand image fails",
      }));
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
        !isAuthenticated ||
        appState === "generating" ||
        imageSelectionCount === 0 ||
        isNiveauModalOpen ||
        isPhotoModalOpen ||
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

        // 1. Detect via altText / URL / type / name
        let detectedNiveauColor = extractNiveauColorFromSelectionContent(content);

        // 2. Detect via ref→color map (needed when altText is unavailable for decorative images)
        if (!detectedNiveauColor && content.ref) {
          try {
            detectedNiveauColor = niveauHandRefToColor.get(JSON.stringify(content.ref)) || undefined;
          } catch { /* ignore ref lookup failures */ }
        }

        if (detectedNiveauColor) {
          await openNiveauHandPicker(detectedNiveauColor);
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
    isAuthenticated,
    appState,
    imageSelectionCount,
    imageSelection,
    isNiveauModalOpen,
    isPhotoModalOpen,
    replacingPhoto,
    replacingNiveauHand,
  ]);

  const handleGenerate = async (
    students: Student[],
    templateId: "rapport",
    extraTexts: PageExtraTexts,
  ) => {
    if (!canAddPage) {
      setGenerationError(intl.formatMessage({
        
        defaultMessage: "This Canva document doesn't support new pages. Open the report in a document type that can add pages.",
        description: "Error shown when the current Canva document type does not support adding pages",
      }));
      return;
    }

    const pageDimensions = await getCurrentPageDimensions();
    const metadata = await getDesignMetadata();
    const dimensions = pageDimensions ?? metadata.defaultPageDimensions;

    if (!dimensions || !isA4Dimensions(dimensions.width, dimensions.height)) {
      setGenerationError(intl.formatMessage({
        
        defaultMessage: "This Canva document is not A4. New pages always take the size of the current document.",
        description: "Error shown when the current Canva document is not A4 format",
      }));
      return;
    } else if (!reportDateRange.fromDate || !reportDateRange.toDate) {
      setGenerationError(intl.formatMessage({
        
        defaultMessage: "First choose a from and to date for the report data.",
        description: "Error shown when no date range has been selected before generating",
      }));
      return;
    } else if (reportDateRange.fromDate > reportDateRange.toDate) {
      setGenerationError(intl.formatMessage({
        
        defaultMessage: "The from date cannot be later than the to date.",
        description: "Error shown when the start date is set after the end date",
      }));
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

  if (!isAuthenticated) {
    return (
      <Box padding="2u">
        <SupportScreen
          isAuthenticated={isAuthenticated}
          connectedEmail={connectedEmail}
          licenseValidUntil={licenseValidUntil}
          onLogin={handleLogin}
        />
      </Box>
    );
  }

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
              {intl.formatMessage({
                
                defaultMessage: "Layout",
                description: "Label for the Layout tab",
              })}
            </Tab>
            <Tab
              id="generate"
              active={activeTab === "generate"}
              onClick={() => setActiveTab("generate")}
            >
              {intl.formatMessage({
                
                defaultMessage: "Generate",
                description: "Label for the Generate tab",
              })}
            </Tab>
            <Tab
              id="support"
              active={activeTab === "support"}
              onClick={() => setActiveTab("support")}
            >
              {intl.formatMessage({
                
                defaultMessage: "Customize",
                description: "Label for the Customize tab",
              })}
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
                reportDateRange={reportDateRange}
                teacherName={teacherName}
                reportTitle={reportTitle.trim() || intl.formatMessage({
                  
                  defaultMessage: "Look what I can already do!",
                  description: "Default report title shown as placeholder and fallback",
                })}
                reportFooter={reportFooter}
                selectedTapes={selectedTapes}
                reportContentOptions={reportContentOptions}
                extraTexts={generatePayload.extraTexts}
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
                isAuthenticated={isAuthenticated}
                onGenerate={handleGenerate}
                generationError={generationError}
                licenseValidUntil={licenseValidUntil}
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
                <Text variant="bold">
                  <FormattedMessage
                    
                    defaultMessage="Replace selected student photo"
                    description="Heading for the photo replacement section in the Customize tab"
                  />
                </Text>
                <Text tone="tertiary">
                  <FormattedMessage
                    
                    defaultMessage="First click on a student photo or level hand in your Canva document, then choose a new photo or color."
                    description="Instructions for replacing a student photo or level hand"
                  />
                </Text>
                <Button
                  variant="secondary"
                  onClick={openStudentPhotoPicker}
                  stretch
                  disabled={imageSelectionCount === 0}
                  loading={studentPhotosLoading}
                >
                  {intl.formatMessage({
                    
                    defaultMessage: "Choose replacement photo",
                    description: "Button to open the student photo picker",
                  })}
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => openNiveauHandPicker()}
                  stretch
                  disabled={imageSelectionCount === 0}
                >
                  {intl.formatMessage({
                    
                    defaultMessage: "Change color of selected hand",
                    description: "Button to open the level hand color picker",
                  })}
                </Button>
              </Rows>
              <SupportScreen
                isAuthenticated={isAuthenticated}
                connectedEmail={connectedEmail}
                licenseValidUntil={licenseValidUntil}
                onLogin={handleLogin}
              />
            </Rows>
          </TabPanel>
        </TabPanels>

        {isBackgroundModalOpen && (
          <div
            style={{
              position: "fixed",
              inset: 0,
              background: "var(--ui-kit-color-ui-overlay-bg, rgba(36, 44, 61, 0.4))",
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
                background: "var(--ui-kit-elevation-surface-floating-bg, #ffffff)",
                boxShadow: "var(--ui-kit-elevation-surface-floating-shadow)",
                borderRadius: 16,
                padding: 20,
              }}
            >
              <Rows spacing="2u">
                <Rows spacing="1u">
                  <Text variant="bold" size="large">
                    <FormattedMessage
                      
                      defaultMessage="Set background"
                      description="Title of the background picker modal"
                    />
                  </Text>
                  <Text tone="tertiary">
                    <FormattedMessage
                      
                      defaultMessage="Choose a background to use for newly generated A4 pages."
                      description="Description shown at the top of the background picker modal"
                    />
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
                  {intl.formatMessage({
                    
                    defaultMessage: "Close",
                    description: "Button to close a modal dialog",
                  })}
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
              background: "var(--ui-kit-color-ui-overlay-bg, rgba(36, 44, 61, 0.4))",
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
                background: "var(--ui-kit-elevation-surface-floating-bg, #ffffff)",
                boxShadow: "var(--ui-kit-elevation-surface-floating-shadow)",
                borderRadius: 16,
                padding: 20,
              }}
            >
              <Rows spacing="2u">
                <Rows spacing="1u">
                  <Text variant="bold" size="large">
                    <FormattedMessage
                      
                      defaultMessage="Replace student photo"
                      description="Title of the student photo replacement modal"
                    />
                  </Text>
                  <Text tone="tertiary">
                    {selectedStudentId
                      ? intl.formatMessage(
                          {
                            
                            defaultMessage: "Choose a photo for student {id}.",
                            description: "Instructions shown when a specific student is identified",
                          },
                          { id: selectedStudentId },
                        )
                      : intl.formatMessage({
                          
                          defaultMessage: "Choose a new photo for the selected image.",
                          description: "Instructions shown when no specific student is identified",
                        })}
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
                        <Text variant="bold">
                          <FormattedMessage
                            
                            defaultMessage="Choose student"
                            description="Heading above the student selection list in the photo modal"
                          />
                        </Text>
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
                            ariaLabel={intl.formatMessage(
                              {
                                
                                defaultMessage: "Student photo {id}",
                                description: "Accessible label for a student photo thumbnail",
                              },
                              { id: photo.id },
                            )}
                            alt={intl.formatMessage(
                              {
                                
                                defaultMessage: "Student photo {id}",
                                description: "Accessible label for a student photo thumbnail",
                              },
                              { id: photo.id },
                            )}
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
                  {intl.formatMessage({
                    
                    defaultMessage: "Close",
                    description: "Button to close a modal dialog",
                  })}
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
              background: "var(--ui-kit-color-ui-overlay-bg, rgba(36, 44, 61, 0.4))",
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
                background: "var(--ui-kit-elevation-surface-floating-bg, #ffffff)",
                boxShadow: "var(--ui-kit-elevation-surface-floating-shadow)",
                borderRadius: 16,
                padding: 20,
              }}
            >
              <Rows spacing="2u">
                <Rows spacing="1u">
                  <Text variant="bold" size="large">
                    <FormattedMessage
                      
                      defaultMessage="Change level hand color"
                      description="Title of the level hand color picker modal"
                    />
                  </Text>
                  <Text tone="tertiary">
                    <FormattedMessage
                      
                      defaultMessage="Click on a color to replace the selected level hand in your document."
                      description="Instructions shown at the top of the level hand color picker modal"
                    />
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
                  {intl.formatMessage({
                    
                    defaultMessage: "Close",
                    description: "Button to close a modal dialog",
                  })}
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
              background: "var(--ui-kit-color-ui-overlay-bg, rgba(36, 44, 61, 0.4))",
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
                background: "var(--ui-kit-elevation-surface-floating-bg, #ffffff)",
                boxShadow: "var(--ui-kit-elevation-surface-floating-shadow)",
                borderRadius: 16,
                padding: 20,
              }}
            >
              <Rows spacing="2u">
                <Rows spacing="1u">
                  <Text variant="bold" size="large">
                    <FormattedMessage
                      
                      defaultMessage="Choose tapes"
                      description="Title of the tape picker modal"
                    />
                  </Text>
                  <Text tone="tertiary">
                    <FormattedMessage
                      
                      defaultMessage="Choose a maximum of 10 tapes."
                      description="Instructions shown at the top of the tape picker modal"
                    />
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
                  {intl.formatMessage({
                    
                    defaultMessage: "Close",
                    description: "Button to close a modal dialog",
                  })}
                </Button>
              </Rows>
            </div>
          </div>
        )}
      </Box>
    </Tabs>
  );
};

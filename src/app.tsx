import React, { useState, useEffect, useCallback } from "react";
import { addPage } from "@canva/design";
import { upload } from "@canva/asset";
import {
  Button,
  Rows,
  Text,
  TextInput,
  LoadingIndicator,
  Box,
  Columns,
  Column,
} from "@canva/app-ui-kit";
import type { ImageRef } from "@canva/asset";

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

type Template = {
  id: "rapport" | "portfolio" | "groei";
  emoji: string;
  label: string;
  description: string;
};

type AppState =
  | "connect"       // nog niet gekoppeld
  | "home"          // gekoppeld, kies klas + template
  | "generating"    // bezig met pagina's aanmaken
  | "done";         // klaar

// ─── Constants ────────────────────────────────────────────────────────────────

const STORAGE_KEY = "kleuterapp_api_key";
const PAGE_W = 816;

const TEMPLATES: Template[] = [
  {
    id: "rapport",
    emoji: "📄",
    label: "Rapport",
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

// ─── API helpers ──────────────────────────────────────────────────────────────

async function apiFetch(path: string, apiKey: string) {
  const res = await fetch(`${BACKEND_HOST}${path}`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (!res.ok) throw new Error(`${res.status}`);
  return res.json();
}

// ─── Page generation ──────────────────────────────────────────────────────────

async function uploadPhoto(url: string): Promise<ImageRef> {
  const asset = await upload({
    type: "image",
    mimeType: "image/jpeg",
    url,
    thumbnailUrl: url,
  });
  return asset.ref;
}

function buildObservationElements(observations: Observation[]) {
  const elements: any[] = [];
  let top = 300;
  for (const obs of observations.slice(0, 6)) {
    elements.push({
      type: "richtext",
      top,
      left: 40,
      width: PAGE_W - 80,
      height: 80,
      children: [
        {
          text: `${obs.domain}  ·  ${obs.date}\n`,
          fontSize: 12,
          fontWeight: "bold",
        },
        { text: obs.note, fontSize: 12 },
      ],
    });
    top += 88;
  }
  return elements;
}

async function generateRapport(student: Student, ref: ImageRef) {
  await addPage({
    elements: [
      // Foto
      { type: "image", ref, top: 40, left: 40, width: 180, height: 180 },
      // Naam
      {
        type: "richtext",
        top: 40,
        left: 240,
        width: 540,
        height: 56,
        children: [{ text: student.name, fontSize: 26, fontWeight: "bold" }],
      },
      // Geboortedatum
      {
        type: "richtext",
        top: 106,
        left: 240,
        width: 540,
        height: 36,
        children: [
          { text: `Geboortedatum: ${student.birthDate}`, fontSize: 13 },
        ],
      },
      // Klas
      {
        type: "richtext",
        top: 140,
        left: 240,
        width: 540,
        height: 36,
        children: [{ text: `Klas: ${student.group}`, fontSize: 13 }],
      },
      // Observaties
      ...buildObservationElements(student.observations),
    ],
  });
}

async function generatePortfolio(student: Student, ref: ImageRef) {
  const lastObs = student.observations[student.observations.length - 1];
  await addPage({
    elements: [
      // Grote foto
      {
        type: "image",
        ref,
        top: 60,
        left: PAGE_W / 2 - 180,
        width: 360,
        height: 360,
      },
      // Naam
      {
        type: "richtext",
        top: 440,
        left: 40,
        width: PAGE_W - 80,
        height: 64,
        children: [{ text: student.name, fontSize: 30, fontWeight: "bold" }],
      },
      // Laatste observatie
      ...(lastObs
        ? [
            {
              type: "richtext" as const,
              top: 520,
              left: 40,
              width: PAGE_W - 80,
              height: 200,
              children: [
                {
                  text: `"${lastObs.note}"`,
                  fontSize: 15,
                },
              ],
            },
          ]
        : []),
    ],
  });
}

async function generateGroei(student: Student, ref: ImageRef) {
  await addPage({
    elements: [
      // Kleine foto
      { type: "image", ref, top: 40, left: 40, width: 100, height: 100 },
      // Naam
      {
        type: "richtext",
        top: 40,
        left: 160,
        width: 600,
        height: 56,
        children: [{ text: student.name, fontSize: 22, fontWeight: "bold" }],
      },
      // Klas + geboortedatum
      {
        type: "richtext",
        top: 96,
        left: 160,
        width: 600,
        height: 36,
        children: [
          {
            text: `${student.group}  ·  ${student.birthDate}`,
            fontSize: 13,
          },
        ],
      },
      // Tabel
      {
        type: "table",
        top: 180,
        left: 40,
        width: PAGE_W - 80,
        rows: [
          {
            cells: [
              { text: { textPlain: "Datum" } },
              { text: { textPlain: "Domein" } },
              { text: { textPlain: "Observatie" } },
              { text: { textPlain: "Score" } },
            ],
          },
          ...student.observations.map((obs) => ({
            cells: [
              { text: { textPlain: obs.date } },
              { text: { textPlain: obs.domain } },
              { text: { textPlain: obs.note } },
              { text: { textPlain: obs.score?.toString() ?? "–" } },
            ],
          })),
        ],
      },
    ],
  });
}

async function generatePageForStudent(
  student: Student,
  templateId: Template["id"]
) {
  const ref = await uploadPhoto(student.photoUrl);
  if (templateId === "rapport") await generateRapport(student, ref);
  if (templateId === "portfolio") await generatePortfolio(student, ref);
  if (templateId === "groei") await generateGroei(student, ref);
}

// ─── Screens ──────────────────────────────────────────────────────────────────

// 1. Koppelscherm
function ConnectScreen({ onConnected }: { onConnected: (key: string) => void }) {
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const connect = async () => {
    const key = input.trim();
    if (!key) return;
    setLoading(true);
    setError("");
    try {
      await apiFetch("/api/validate", key);
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
        <Text variant="heading">Koppel je account</Text>
        <Text>
          Open de kleuterapp, ga naar{" "}
          <Text variant="bold">Instellingen → Canva-koppelcode</Text> en
          kopieer de code. Plak hem hieronder.
        </Text>
      </Rows>

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
    </Rows>
  );
}

// 2. Homescherm — klas + template kiezen
function HomeScreen({
  apiKey,
  onGenerate,
  onDisconnect,
}: {
  apiKey: string;
  onGenerate: (students: Student[], template: Template["id"]) => void;
  onDisconnect: () => void;
}) {
  const [groups, setGroups] = useState<Group[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [selectedGroup, setSelectedGroup] = useState<string>("");
  const [selectedTemplate, setSelectedTemplate] = useState<Template["id"]>("rapport");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    const load = async () => {
      try {
        const [groupData, studentData] = await Promise.all([
          apiFetch("/api/groups", apiKey),
          apiFetch("/api/students", apiKey),
        ]);
        setGroups(groupData);
        setStudents(studentData);
        if (groupData.length > 0) setSelectedGroup(groupData[0].id);
      } catch {
        setLoadError("Kon gegevens niet ophalen. Controleer je verbinding.");
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [apiKey]);

  const studentsInGroup = students.filter((s) => s.group === selectedGroup);

  if (loading) return <LoadingIndicator />;
  if (loadError) return (
    <Rows spacing="2u">
      <Text tone="critical">{loadError}</Text>
      <Button variant="secondary" onClick={onDisconnect} stretch>
        Ontkoppelen
      </Button>
    </Rows>
  );

  return (
    <Rows spacing="3u">

      {/* Stap 1 — Klas */}
      <Rows spacing="1u">
        <Text variant="bold">① Kies een klas</Text>
        <Rows spacing="1u">
          {groups.map((g) => (
            <Button
              key={g.id}
              variant={selectedGroup === g.id ? "primary" : "secondary"}
              onClick={() => setSelectedGroup(g.id)}
              stretch
            >
              {g.name} ({g.studentCount} leerlingen)
            </Button>
          ))}
        </Rows>
      </Rows>

      {/* Stap 2 — Template */}
      <Rows spacing="1u">
        <Text variant="bold">② Kies een template</Text>
        <Rows spacing="1u">
          {TEMPLATES.map((t) => (
            <Button
              key={t.id}
              variant={selectedTemplate === t.id ? "primary" : "secondary"}
              onClick={() => setSelectedTemplate(t.id)}
              stretch
            >
              {t.emoji} {t.label} — {t.description}
            </Button>
          ))}
        </Rows>
      </Rows>

      {/* Stap 3 — Genereren */}
      <Rows spacing="1u">
        <Text variant="bold">③ Genereer pagina's</Text>
        {studentsInGroup.length === 0 ? (
          <Text tone="tertiary">Geen leerlingen gevonden in deze klas.</Text>
        ) : (
          <Button
            variant="primary"
            onClick={() => onGenerate(studentsInGroup, selectedTemplate)}
            stretch
          >
            Maak {studentsInGroup.length} pagina's aan →
          </Button>
        )}
      </Rows>

      {/* Ontkoppelen */}
      <Button variant="tertiary" onClick={onDisconnect} stretch>
        Account ontkoppelen
      </Button>
    </Rows>
  );
}

// 3. Genereer-scherm — voortgang
function GeneratingScreen({
  students,
  templateId,
  onDone,
  onCancel,
}: {
  students: Student[];
  templateId: Template["id"];
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
      for (const student of students) {
        if (cancelled.current) return;
        try {
          await generatePageForStudent(student, templateId);
        } catch {
          setFailed((prev) => [...prev, student.name]);
        }
        i++;
        setCurrent(i);
      }
      if (!cancelled.current) onDone();
    };

    run();
    return () => { cancelled.current = true; };
  }, []);

  const pct = Math.round((current / students.length) * 100);
  const currentStudent = students[Math.min(current, students.length - 1)];

  return (
    <Rows spacing="3u">
      <Text variant="heading">Pagina's aanmaken…</Text>

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
        <Text variant="heading">✅ Klaar!</Text>
        <Text>
          {count} pagina's zijn aangemaakt in je Canva-document. Je kunt nu
          aanpassingen maken en daarna afdrukken via{" "}
          <Text variant="bold">Delen → Downloaden → PDF</Text>.
        </Text>
      </Rows>
      <Button variant="primary" onClick={onBack} stretch>
        Nog een klas genereren
      </Button>
    </Rows>
  );
}

// ─── Root app ─────────────────────────────────────────────────────────────────

export const App = () => {
  const [apiKey, setApiKey] = useState<string>(() =>
    localStorage.getItem(STORAGE_KEY) ?? ""
  );
  const [appState, setAppState] = useState<AppState>(() =>
    localStorage.getItem(STORAGE_KEY) ? "home" : "connect"
  );
  const [generatePayload, setGeneratePayload] = useState<{
    students: Student[];
    templateId: Template["id"];
  } | null>(null);

  const handleConnected = (key: string) => {
    setApiKey(key);
    setAppState("home");
  };

  const handleDisconnect = () => {
    localStorage.removeItem(STORAGE_KEY);
    setApiKey("");
    setAppState("connect");
  };

  const handleGenerate = (students: Student[], templateId: Template["id"]) => {
    setGeneratePayload({ students, templateId });
    setAppState("generating");
  };

  const handleDone = () => setAppState("done");
  const handleBack = () => setAppState("home");

  if (appState === "connect") {
    return <ConnectScreen onConnected={handleConnected} />;
  }

  if (appState === "home") {
    return (
      <HomeScreen
        apiKey={apiKey}
        onGenerate={handleGenerate}
        onDisconnect={handleDisconnect}
      />
    );
  }

  if (appState === "generating" && generatePayload) {
    return (
      <GeneratingScreen
        students={generatePayload.students}
        templateId={generatePayload.templateId}
        onDone={handleDone}
        onCancel={handleBack}
      />
    );
  }

  if (appState === "done" && generatePayload) {
    return (
      <DoneScreen
        count={generatePayload.students.length}
        onBack={handleBack}
      />
    );
  }

  return null;
};

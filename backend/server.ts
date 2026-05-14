import express from "express";
import crypto from "crypto";
import cors from "cors";

const app = express();
const PORT = process.env.CANVA_BACKEND_PORT ?? 3001;
const APP_ORIGIN = process.env.CANVA_APP_ORIGIN ?? "http://localhost:8080";

// ─── Middleware ────────────────────────────────────────────────────────────────

app.use(express.json());

// Alleen verzoeken van de Canva plugin toestaan
app.use(
  cors({
    origin: APP_ORIGIN,
    methods: ["GET", "POST"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

// ─── API key helpers ───────────────────────────────────────────────────────────

/**
 * Genereer een nieuwe API-sleutel voor een gebruiker.
 * Formaat: "<userId>.<32 random bytes als hex>"
 * Sla in de database ALLEEN de hash op (sha256), nooit de sleutel zelf.
 */
export function generateApiKey(userId: string): string {
  const secret = crypto.randomBytes(32).toString("hex");
  return `${userId}.${secret}`;
}

function sha256(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

/**
 * Haal userId op uit de Authorization header en valideer de sleutel.
 * Geeft de userId terug als de sleutel geldig is, anders null.
 *
 * Vervang de mock DB-opzoeking hieronder door je eigen database query:
 *   SELECT user_id FROM api_keys WHERE user_id = ? AND key_hash = ?
 */
async function validateApiKey(authHeader: string | undefined): Promise<string | null> {
  if (!authHeader?.startsWith("Bearer ")) return null;

  const key = authHeader.slice(7); // verwijder "Bearer "
  const [userId] = key.split(".");
  if (!userId) return null;

  const keyHash = sha256(key);

  // ── Vervang dit door je eigen DB-query ─────────────────────────────────────
  const row = await mockDb.findApiKey(userId, keyHash);
  // ───────────────────────────────────────────────────────────────────────────

  return row ? userId : null;
}

// Middleware die elke route beveiligt
async function requireAuth(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
) {
  const userId = await validateApiKey(req.headers.authorization);
  if (!userId) {
    res.status(401).json({ error: "Ongeldige of ontbrekende API-sleutel." });
    return;
  }
  // Zet userId op het request-object zodat routes het kunnen gebruiken
  (req as any).userId = userId;
  next();
}

// ─── Mock database (vervang door jouw echte DB) ────────────────────────────────

const mockDb = {
  // Simuleer opgeslagen sleutels: { userId -> keyHash }
  // In productie: query je database
  _keys: new Map<string, string>(),

  async findApiKey(userId: string, keyHash: string): Promise<boolean> {
    return this._keys.get(userId) === keyHash;
  },

  async saveApiKey(userId: string, keyHash: string): Promise<void> {
    this._keys.set(userId, keyHash);
  },

  // Simuleer leerlingen per gebruiker
  async getStudents(userId: string): Promise<any[]> {
    // Vervang door: SELECT * FROM students WHERE teacher_id = ?
    return MOCK_STUDENTS.filter((s) => s.teacherId === userId);
  },

  async getGroups(userId: string): Promise<any[]> {
    const students = await this.getStudents(userId);
    const groupMap = new Map<string, number>();
    for (const s of students) {
      groupMap.set(s.group, (groupMap.get(s.group) ?? 0) + 1);
    }
    return Array.from(groupMap.entries()).map(([name, count], i) => ({
      id: name,
      name,
      studentCount: count,
    }));
  },
};

// ─── Voorbeeld: API-sleutel aanmaken voor een gebruiker ───────────────────────
// Roep dit aan vanuit jouw eigen app wanneer de juf haar koppelcode opvraagt.

export async function createApiKeyForUser(userId: string): Promise<string> {
  const key = generateApiKey(userId);
  const keyHash = sha256(key);
  await mockDb.saveApiKey(userId, keyHash);
  return key; // stuur dit terug naar de juf (alleen deze keer zichtbaar)
}

// ─── Routes ───────────────────────────────────────────────────────────────────

/**
 * Valideer een API-sleutel.
 * De Canva plugin roept dit aan direct na het plakken van de koppelcode.
 */
app.get("/api/validate", requireAuth, (req, res) => {
  res.json({ ok: true, userId: (req as any).userId });
});

/**
 * Geef alle klassen terug voor de ingelogde juf.
 */
app.get("/api/groups", requireAuth, async (req, res) => {
  const groups = await mockDb.getGroups((req as any).userId);
  res.json(groups);
});

/**
 * Geef alle leerlingen terug voor de ingelogde juf, inclusief observaties.
 */
app.get("/api/students", requireAuth, async (req, res) => {
  const students = await mockDb.getStudents((req as any).userId);
  res.json(students);
});

// ─── Start server ─────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`✅ Backend draait op http://localhost:${PORT}`);
});

// ─── Mock data (vervang door echte DB-queries) ────────────────────────────────

const MOCK_STUDENTS = [
  {
    id: "leerling-1",
    teacherId: "user-demo",
    name: "Emma de Vries",
    birthDate: "2020-03-12",
    group: "Groep 1A",
    photoUrl: "https://picsum.photos/seed/emma/400/400",
    observations: [
      {
        date: "2026-04-10",
        domain: "Taal",
        note: "Emma herkent alle letters van haar naam en schrijft ze zelfstandig.",
        score: 3,
      },
      {
        date: "2026-04-15",
        domain: "Sociaal",
        note: "Speelt goed samen met klasgenoten, neemt initiatief bij groepsspel.",
        score: 4,
      },
      {
        date: "2026-05-02",
        domain: "Rekenen",
        note: "Telt betrouwbaar tot 20, maakt eenvoudige optellingen met vingers.",
        score: 3,
      },
    ],
  },
  {
    id: "leerling-2",
    teacherId: "user-demo",
    name: "Liam Bakker",
    birthDate: "2020-07-04",
    group: "Groep 1A",
    photoUrl: "https://picsum.photos/seed/liam/400/400",
    observations: [
      {
        date: "2026-04-11",
        domain: "Motoriek",
        note: "Goede fijne motoriek: knipt netjes langs lijnen, kleurt binnen lijntjes.",
        score: 4,
      },
      {
        date: "2026-04-22",
        domain: "Taal",
        note: "Woordenschat groeit snel. Heeft soms moeite met lange zinnen.",
        score: 2,
      },
    ],
  },
  {
    id: "leerling-3",
    teacherId: "user-demo",
    name: "Sofie Janssen",
    birthDate: "2020-01-28",
    group: "Groep 1B",
    photoUrl: "https://picsum.photos/seed/sofie/400/400",
    observations: [
      {
        date: "2026-04-09",
        domain: "Sociaal",
        note: "Speelt het liefst alleen maar is vriendelijk naar anderen.",
        score: 2,
      },
    ],
  },
];

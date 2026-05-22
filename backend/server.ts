import express from "express";
import cors from "cors";

const app = express();
const PORT = process.env.CANVA_BACKEND_PORT ?? 3001;
const APP_ORIGIN = process.env.CANVA_APP_ORIGIN ?? "http://localhost:8080";

// ─── Middleware ────────────────────────────────────────────────────────────────

app.use(express.json());

app.use(
  cors({
    origin: APP_ORIGIN,
    methods: ["GET", "POST"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

// ─── OAuth Bearer-token validatie ─────────────────────────────────────────────

/**
 * Haal het Bearer-token op uit de Authorization-header.
 * In productie zou je dit token valideren via het OAuth-introspectie-endpoint
 * van de SCV-server (https://scv.silvas.dev/oauth/v1/token).
 * Voor de lokale dev-mock accepteren we elk geldig-uitziend Bearer-token.
 */
function extractBearerToken(authHeader: string | undefined): string | null {
  if (!authHeader?.startsWith("Bearer ")) return null;
  const token = authHeader.slice(7).trim();
  return token.length > 0 ? token : null;
}

async function requireAuth(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
) {
  const token = extractBearerToken(req.headers.authorization);
  if (!token) {
    res.status(401).json({ error: "Geen geldig Bearer-token aanwezig." });
    return;
  }
  // Token doorsturen naar volgende route-handler
  (req as any).accessToken = token;
  next();
}

// ─── Mock database (vervang door jouw echte DB) ────────────────────────────────

const mockDb = {
  async getStudents(groupId?: string): Promise<any[]> {
    // Vervang door: SELECT * FROM students WHERE group_id = ?
    let students = MOCK_STUDENTS;
    if (groupId && groupId !== "0") {
      students = students.filter((s) => s.group === groupId);
    }
    return students;
  },

  async getGroups(): Promise<any[]> {
    const groupMap = new Map<string, number>();
    for (const s of MOCK_STUDENTS) {
      groupMap.set(s.group, (groupMap.get(s.group) ?? 0) + 1);
    }
    return Array.from(groupMap.entries()).map(([name, count]) => ({
      id: name,
      name,
      studentCount: count,
    }));
  },
};

// ─── Routes ───────────────────────────────────────────────────────────────────

app.get("/api/groups", requireAuth, async (_req, res) => {
  const groups = await mockDb.getGroups();
  res.json(groups);
});

app.get("/api/students", requireAuth, async (req, res) => {
  const groupId = req.query.group_id as string | undefined;
  const students = await mockDb.getStudents(groupId);
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

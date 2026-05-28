import "dotenv/config";
import { user } from "@canva/app-middleware/express";
import cors from "cors";
import express from "express";
import { createBaseServer } from "../utils/backend/base_backend/create";

type Observation = {
  date: string;
  domain: string;
  note: string;
  score?: number;
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

const APP_ID = process.env.CANVA_APP_ID;
const APP_ORIGIN = process.env.CANVA_APP_ORIGIN;

if (!APP_ID) {
  throw new Error(
    "The CANVA_APP_ID environment variable is undefined. Set it in the project's .env file.",
  );
}

const router = express.Router();
router.use(
  cors({
    origin: APP_ORIGIN ?? true,
    methods: ["GET"],
    allowedHeaders: ["Content-Type", "Authorization"],
  }),
);

// Verify Canva-issued JWTs on all API routes.
router.use(user.verifyToken({ appId: APP_ID }));

const mockDb = {
  async getStudents(groupId?: string): Promise<Student[]> {
    let students = MOCK_STUDENTS;
    if (groupId && groupId !== "0") {
      students = students.filter((student) => student.group === groupId);
    }
    return students;
  },

  async getGroups(): Promise<Group[]> {
    const groupMap = new Map<string, number>();
    for (const student of MOCK_STUDENTS) {
      groupMap.set(student.group, (groupMap.get(student.group) ?? 0) + 1);
    }

    return Array.from(groupMap.entries()).map(([name, count]) => ({
      id: name,
      name,
      studentCount: count,
    }));
  },
};

router.get("/api/groups", async (_req, res) => {
  const groups = await mockDb.getGroups();
  res.json(groups);
});

router.get("/api/students", async (req, res) => {
  const groupId = req.query.group_id as string | undefined;
  const students = await mockDb.getStudents(groupId);
  res.json(students);
});

const server = createBaseServer(router);
server.start(process.env.CANVA_BACKEND_PORT);

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

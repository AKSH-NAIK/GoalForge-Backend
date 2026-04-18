import cors from "cors";
import Groq from "groq-sdk";
import dotenv from "dotenv";
import { jsonrepair } from "jsonrepair";
import express from "express";

dotenv.config();

const app = express();

app.use(cors());
app.use(express.json());

app.get("/", (req, res) => {
  res.send("GoalForge Backend");
});

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

const MAX_WEEKS_PER_PHASE = 12;

// convert duration → weeks
const convertToWeeks = (duration) => {
  if (!duration) return 4;
  const num = parseInt(duration) || 4;
  const lower = String(duration).toLowerCase();

  if (lower.includes("year")) return num * 52;
  if (lower.includes("month")) return num * 4;
  if (lower.includes("week")) return num;

  return num;
};

app.post("/api/generate-plan", async (req, res) => {
  try {
    const {
      goal,
      duration,
      level,
      knowledge,
      previousWeeks = []
    } = req.body;

    if (!goal || !duration) {
      return res.status(400).json({ error: "Goal and Duration are required." });
    }

    // SAFE HANDLING
    const previousWeeksSafe = Array.isArray(previousWeeks) ? previousWeeks : [];

    const totalWeeks = convertToWeeks(duration);

    // generate in phases
    const weeksToGenerate = Math.min(MAX_WEEKS_PER_PHASE, totalWeeks);

    const lastWeekNumber = previousWeeksSafe.length;
    
    // Instead of raw JSON, summarize past topics to save tokens and prevent repetition
    const pastTopics = previousWeeksSafe.flatMap(w => w.learn).filter(Boolean);

    // ================= AI CALL =================
    const response = await groq.chat.completions.create({
      model: "llama-3.1-8b-instant",
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: `You are a strict career planner and AI mentor. Return ONLY valid JSON format representing the curriculum layout. Do not output markdown code blocks, just raw JSON.

Format:
{
  "title": "Roadmap Title",
  "duration": "Duration",
  "weeks": [
    {
      "week": "Week Number",
      "goal": "Week Goal",
      "learn": ["Topic 1", "Topic 2"],
      "tasks": ["Task 1", "Task 2"],
      "ai_help": {
        "use_ai_for": ["Tip 1"],
        "avoid_ai_for": ["Warning 1"],
        "tips": ["Tip 1"]
      }
    }
  ]
}`
        },
        {
          role: "user",
          content: `CONTEXT:
- Generate EXACTLY ${weeksToGenerate} novel weeks.

${previousWeeksSafe.length > 0 ? `
CONTINUATION MODE:
- User already completed ${lastWeekNumber} weeks.
- Start from Week ${lastWeekNumber + 1}.
- DO NOT summarize or repeat the following past topics: ${pastTopics.join(", ")}.
- You must introduce progressively advanced concepts.
` : `
FRESH START:
- Start from Week 1.
`}

STRICT RULES:
- EXACTLY ${weeksToGenerate} weeks
- No duplicates
- No vague tasks

PROGRESSION:
- Increase difficulty gradually
- End with real-world projects

QUALITY:
- 2–4 tasks per week
- Practical + specific tasks

User Input:
Goal: ${goal}
Duration: ${duration}
Level: ${level}
Knowledge: ${knowledge}`
        }
      ],
    });

    const raw = response.choices[0].message.content;

    if (!raw) throw new Error("Empty AI response");

    // ================= JSON EXTRACTION =================
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");

    if (start === -1 || end === -1) {
      return res.status(500).json({ error: "Invalid AI response" });
    }

    const clean = raw.slice(start, end + 1);

    let parsed;

    try {
      parsed = JSON.parse(clean);
    } catch {
      try {
        const repaired = jsonrepair(clean);
        parsed = JSON.parse(repaired);
      } catch (err) {
        console.error("JSON repair failed:", err);
        return res.status(500).json({ error: "Invalid JSON" });
      }
    }

    // ================= FIX LENGTH =================
    if (!parsed.weeks || parsed.weeks.length !== weeksToGenerate) {
      const fixed = [];

      for (let i = 0; i < weeksToGenerate; i++) {
        fixed.push(
          parsed.weeks?.[i] || {
            week: `Week ${lastWeekNumber + i + 1}`,
            goal: "Apply concepts in real-world scenarios",
            learn: ["Advanced topic", "System design"],
            tasks: [
              "Build a real-world project",
              "Implement production feature"
            ],
            ai_help: {
              use_ai_for: ["Debugging"],
              avoid_ai_for: ["Copying blindly"],
              tips: ["Stay consistent"]
            }
          }
        );
      }

      parsed.weeks = fixed;
    }

    // ================= NORMALIZE + REMOVE DUPES =================
    const seen = new Set();

    parsed.weeks = parsed.weeks.map((week, i) => {
      week.week = `Week ${lastWeekNumber + i + 1}`;

      week.learn = Array.isArray(week.learn) ? week.learn : [];
      week.tasks = Array.isArray(week.tasks) ? week.tasks : [];

      week.learn = week.learn.map(x =>
        typeof x === "object" ? Object.values(x)[0] : x
      );

      week.tasks = week.tasks.map(x =>
        typeof x === "object" ? Object.values(x)[0] : x
      );

      if (week.tasks.length < 2) {
        week.tasks = [
          "Build a real project",
          "Apply concepts in real scenario"
        ];
      }

      //  duplicate prevention
      const key = JSON.stringify(week.tasks);

      if (seen.has(key)) {
        week.tasks = [
          "Create a different project using same concept",
          "Apply concept in new domain"
        ];
      }

      seen.add(key);

      week.ai_help = week.ai_help || {};

      week.ai_help.use_ai_for =
        week.ai_help.use_ai_for?.length
          ? week.ai_help.use_ai_for
          : ["Understanding concepts"];

      week.ai_help.avoid_ai_for =
        week.ai_help.avoid_ai_for?.length
          ? week.ai_help.avoid_ai_for
          : ["Copy pasting"];

      week.ai_help.tips =
        week.ai_help.tips?.length
          ? week.ai_help.tips
          : ["Stay consistent"];

      return week;
    });

    // ================= RESPONSE =================
    res.json({
      result: parsed,
      nextStartWeek: lastWeekNumber + weeksToGenerate
    });

  } catch (err) {
    console.error("Backend Error:", err);
    res.status(500).json({
      error: err.message
    });
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
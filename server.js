import cors from "cors";
import Groq from "groq-sdk";
import dotenv from "dotenv";
import { jsonrepair } from "jsonrepair";
import express from "express";

dotenv.config();

const app = express();

app.use(cors());
app.use(express.json());

// timeout safety
app.use((req, res, next) => {
  res.setTimeout(15000, () => {
    res.status(503).json({ error: "Request timeout" });
  });
  next();
});

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

    const previousWeeksSafe = Array.isArray(previousWeeks) ? previousWeeks : [];

    const totalWeeks = convertToWeeks(duration);
    const weeksToGenerate = Math.min(MAX_WEEKS_PER_PHASE, totalWeeks);
    const lastWeekNumber = previousWeeksSafe.length;

    const pastTopics = previousWeeksSafe.flatMap(w => w.learn).filter(Boolean);

    let response;

    try {
      response = await groq.chat.completions.create({
        model: "llama-3.1-8b-instant",
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content: `You are a strict career planner and AI mentor.

Return ONLY valid JSON. No markdown.

IMPORTANT:
- Use EXACT key: "ai_help"
- Never use "aiTips" or variations

Format:
{
  "title": "Roadmap Title",
  "duration": "Duration",
  "weeks": [
    {
      "week": "Week Number",
      "goal": "Week Goal",
      "learn": ["Topic 1"],
      "tasks": ["Task 1"],
      "ai_help": {
        "use_ai_for": ["Tip"],
        "avoid_ai_for": ["Warning"],
        "tips": ["Advice"]
      }
    }
  ]
}`
          },
          {
            role: "user",
            content: `CONTEXT:
- Generate EXACTLY ${weeksToGenerate} weeks.

${previousWeeksSafe.length > 0 ? `
CONTINUATION MODE:
- User completed ${lastWeekNumber} weeks
- Start from Week ${lastWeekNumber + 1}
- Avoid repeating: ${pastTopics.join(", ")}
` : `
FRESH START:
- Start from Week 1
`}

RULES:
- No duplicates
- 2–4 tasks per week
- Increasing difficulty
- End with real-world projects

User Input:
Goal: ${goal}
Duration: ${duration}
Level: ${level}
Knowledge: ${knowledge}`
          }
        ],
      });
    } catch (err) {
      console.error("Groq Error:", err);
      return res.status(500).json({ error: "AI service failed" });
    }

    const raw = response?.choices?.[0]?.message?.content;

    if (!raw) {
      return res.status(500).json({ error: "Empty AI response" });
    }

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

    // fallback if AI fails
    if (!parsed.weeks || parsed.weeks.length !== weeksToGenerate) {
      parsed.weeks = Array.from({ length: weeksToGenerate }, (_, i) => ({
        week: `Week ${lastWeekNumber + i + 1}`,
        goal: "Apply concepts in real-world scenarios",
        learn: ["Advanced topic"],
        tasks: [
          { text: "Build a project", done: false },
          { text: "Apply concepts", done: false }
        ],
        ai_help: {
          use_ai_for: [],
          avoid_ai_for: [],
          tips: []
        }
      }));
    }

    const seen = new Set();

    parsed.weeks = parsed.weeks.map((week, i) => {
      week.week = `Week ${lastWeekNumber + i + 1}`;

      week.learn = Array.isArray(week.learn) ? week.learn : [];
      week.tasks = Array.isArray(week.tasks) ? week.tasks : [];

      // normalize learn
      week.learn = week.learn.map(x =>
        typeof x === "object" ? Object.values(x)[0] : x
      );

      // normalize tasks
      week.tasks = week.tasks.map(task => {
        if (typeof task === "string") {
          return { text: task, done: false };
        }

        return {
          text:
            task.text ||
            task.task ||
            task.description ||
            task.title ||
            Object.values(task)[0],
          done: task.done || false
        };
      });

      if (week.tasks.length < 2) {
        week.tasks = [
          { text: "Build a project", done: false },
          { text: "Apply concepts", done: false }
        ];
      }

      const key = JSON.stringify(week.tasks.map(t => t.text));

      if (seen.has(key)) {
        week.tasks = [
          { text: "Try a different project", done: false },
          { text: "Apply in new domain", done: false }
        ];
      }

      seen.add(key);

  
      if (!week.ai_help && week.aiTips) {
        week.ai_help = week.aiTips;
      }

      week.ai_help = week.ai_help || {};

      
      week.ai_help.use_ai_for = Array.isArray(week.ai_help.use_ai_for)
        ? week.ai_help.use_ai_for
        : [];

      week.ai_help.avoid_ai_for = Array.isArray(week.ai_help.avoid_ai_for)
        ? week.ai_help.avoid_ai_for
        : [];

      week.ai_help.tips = Array.isArray(week.ai_help.tips)
        ? week.ai_help.tips
        : [];

      return week;
    });

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
import express from "express";
import cors from "cors";
import Groq from "groq-sdk";
import dotenv from "dotenv";
dotenv.config();
const app = express();

app.use(cors());

app.use(express.json());

// routes
app.get("/", (req, res) => {
  res.send("GoalForge Backend");
});

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});
app.post("/api/generate-plan", async (req, res) => {
  const { goal, duration, level ,knowledge } = req.body;

  const response = await groq.chat.completions.create({
   model: "llama-3.1-8b-instant",
    messages: [
      {
        role: "user",
      content: `You are a strict career planner and AI mentor.

Return ONLY valid JSON. No text outside JSON.

Format:
{
  "title": "",
  "duration": "",
  "weeks": [
    {
      "week": "",
      "goal": "",
      "learn": [],
      "tasks": [],
      "ai_help": {
        "use_ai_for": [],
        "avoid_ai_for": [],
        "tips": []
      }
    }
  ]
}

Rules:
- Divide properly into weekly plan
- Each week must be focused
- Tasks must be practical (projects, exercises)
- Keep arrays short (3-5 items max)
- AI suggestions must be realistic and useful
- No explanations outside JSON
- "week" must be like "Week 1", "Week 2"
- Do NOT merge weeks (no "6-12")
-"use_ai_for" must NOT be empty
- "avoid_ai_for" must NOT be empty
- "tips" must NOT be empty
- "learn" must always have at least 2 items

User Input:
Goal: ${goal}
Duration: ${duration}
Level: ${level}
Knowledge: ${knowledge}`
      }
    ],
  });

 const raw = response.choices[0].message.content;

const clean = raw.substring(
  raw.indexOf("{"),
  raw.lastIndexOf("}") + 1
);

const parsed = JSON.parse(clean);

parsed.weeks.forEach(week => {

  // SAFE normalize learn
  week.learn = (week.learn || []).map(item =>
    item && typeof item === "object" ? item.topic || "" : item || ""
  );

  // SAFE normalize tasks
  week.tasks = (week.tasks || []).map(item =>
    item && typeof item === "object" ? item.topic || "" : item || ""
  );

  // SAFE ai_help object
  week.ai_help = week.ai_help || {};

  week.ai_help.use_ai_for = (week.ai_help.use_ai_for || []).map(item =>
    item && typeof item === "object" ? item.topic || "" : item || ""
  );

  week.ai_help.avoid_ai_for = (week.ai_help.avoid_ai_for || []).map(item =>
    item && typeof item === "object" ? item.topic || "" : item || ""
  );

  week.ai_help.tips = (week.ai_help.tips || []).map(item =>
    item && typeof item === "object" ? item.topic || "" : item || ""
  );

  if (week.ai_help.avoid_ai_for.length === 0) {
    week.ai_help.avoid_ai_for = [
      "Solving problems on your own",
      "Debugging without AI assistance",
      "Thinking through logic before coding"
    ];
  }
});

res.json({
  result: parsed
});
});

app.listen(5000, () => {
  console.log("Server running on port 5000");
});
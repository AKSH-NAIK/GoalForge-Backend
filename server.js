import express from "express";
import Groq from "groq-sdk";
import dotenv from "dotenv";
dotenv.config();
const app = express();

app.use(express.json());

// route
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

res.json({
  result: parsed
});
});

// start server
app.listen(5000, () => {
  console.log("Server running on port 5000");
});
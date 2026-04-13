import express from "express";

const app = express();

app.use(express.json());

// route
app.get("/", (req, res) => {
  res.send("GoalForge Backend");
});

// start server
app.listen(5000, () => {
  console.log("Server running on port 5000");
});
const dotenv = require("dotenv");
dotenv.config();
const express = require("express");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const cors = require("cors");

const app = express();
app.use(cors({ origin: "*" }));

app.use(express.json());

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

app.post("/api/domain-info", async (req, res) => {
  try {
    const { prompt } = req.body;
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
    const result = await model.generateContent(prompt);

    // ✅ Safely extract text depending on SDK version
    let text = result?.response?.text
      ? await result.response.text()
      : result?.candidates?.[0]?.content?.parts?.map((p) => p.text).join(" ") ||
        "";

    // ✅ Remove Markdown code block markers
    text = text.replace(/```json|```/g, "").trim();

    // ✅ Try parsing JSON

    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch (err) {
      console.error("Parsing error:", err.message, "Raw text:", text);
      return res
        .status(500)
        .json({ error: "Gemini did not return valid JSON", raw: text });
    }

    res.json(parsed); // ✅ Send structured JSON
  } catch (err) {
    console.error("Gemini API error:", err);
    res.status(500).json({ error: "Something went wrong" });
  }
});

app.get("/api/quiz", async (req, res) => {
  try {
    const result = await model.generateContent(
      `Generate a 5 minute comprising of at least 30 questions for Aptitude & Interest-Based Course Suggestion. The questions must be easy to understand and clear from a mixed group of branches so that a non-biased desicision could be generated. The questions should be a mixzed of situational, preference-based, and self-assessment types. So that the classifacation is the best possible choice for the user.
      - "question" (string)
      - "options" (array of 4 multiple choice strings). 
      Respond in JSON format only.`
    );

    let text = result.response
      .text()
      .replace(/```json|```/g, "")
      .trim();
    const parsed = JSON.parse(text);

    res.json(parsed || parsed?.data?.questions);
  } catch (err) {
    console.error("Quiz fetch error:", err.message);
    res.status(500).json({ error: "Failed to fetch quiz" });
  }
});

// ✅ Analyze Answers
app.post("/api/quiz/analyze", async (req, res) => {
  try {
    const { answers } = req.body;

    const result = await model.generateContent(
      `The user has completed a career quiz. 
      Here are the answers: ${JSON.stringify(answers)}.
      Based on their choices, analyze their mindset and suggest the most suitable career path.
      Respond with a JSON object like:
      { "career": "Software Engineer", "reason": "Because..." }`
    );

    let text = result.response
      .text()
      .replace(/```json|```/g, "")
      .trim();
    const parsed = JSON.parse(text);
    console.log("Parsed analysis:", parsed);

    res.json(parsed);
  } catch (err) {
    console.error("Quiz analyze error:", err.message);
    res.status(500).json({ error: "Failed to analyze answers" });
  }
});

app.listen(3000, () => console.log("Server running on port 3000"));


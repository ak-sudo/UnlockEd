
const dotenv = require("dotenv");
dotenv.config();
const express = require("express");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const cors = require("cors");


const app = express();
app.use(cors( {origin: '*'} ));

app.use(express.json());
app.post("/api/domain-info", async (req, res) => {
  try {
    const { prompt } = req.body;
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
    const result = await model.generateContent(prompt);

    // ✅ Safely extract text depending on SDK version
    let text = result?.response?.text
      ? await result.response.text()
      : result?.candidates?.[0]?.content?.parts?.map(p => p.text).join(" ") || "";

    // ✅ Remove Markdown code block markers
    text = text.replace(/```json|```/g, "").trim();

    // ✅ Try parsing JSON

    let parsed;
    try {
      parsed = JSON.parse(text);

    } catch (err) {
      console.error("Parsing error:", err.message, "Raw text:", text);
      return res.status(500).json({ error: "Gemini did not return valid JSON", raw: text });
    }

    
    res.json(parsed); // ✅ Send structured JSON
  } catch (err) {
    console.error("Gemini API error:", err);
    res.status(500).json({ error: "Something went wrong" });
  }
});



app.listen(3000, () => console.log("Server running on port 3000"));

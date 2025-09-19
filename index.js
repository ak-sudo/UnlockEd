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
    const result =
      await model.generateContent(`Generate a 5-minute aptitude & interest-based course/career suggestion quiz with at least 30 questions. The quiz must be designed to explore interests, skills, values, and personality traits across **all career domains** —not just technical fields. It should consider streams like **Science, Arts/Humanities, Commerce, Vocational, Law, Healthcare, Education, Sports, Business, Media, Social Services, and Creative Fields**.

### Requirements:
- Each question should be easy to understand and **clear for students from any branch/background**. 
- Questions should be a mix of:
  1. **Situational** (what would you do in a certain scenario),
  2. **Preference-based** (what kind of activities you enjoy or prefer),
  3. **Self-assessment** (how you rate yourself in a skill/trait).
- The goal is to enable a **non-biased decision** for career/stream selection.  
- The questions must **not directly reveal the career outcome**, but instead reflect **strengths, mindset, and interest areas**.  
- Every question should have exactly:
  - "question" (string),
  - "options" (array of 4 multiple-choice strings).  

### Output:
Return only valid **JSON format** as:
[
  {
    "question": "string",
    "options": ["option1", "option2", "option3", "option4"]
  },
  ...
]

### Additional Instructions:
- Ensure diversity: at least some questions should map to interests in **teaching, arts, law, sports, medicine, business, social work, and technology**.  
- Avoid jargon; keep the language **simple for high-school students**.  
- Balance the quiz so **both academic and non-academic interests** are reflected.  
- No explanations, just pure JSON array.
`);

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


    const result = await model.generateContent(`The user has completed a career quiz. 
      Here are the answers: ${JSON.stringify(answers)}.
      You are an expert career counselor. Your task is to analyze the student's quiz responses 
and recommend the most suitable career paths.  

### Input:
- You will receive a JSON array of the student's responses, 
  where each item has:
  {
    "question": "string",
    "selectedOption": "string"
  }

### Instructions:
1. Evaluate the answers holistically.  
   - Identify the student’s interests, aptitudes, values, and personality traits.  
   - Consider not only academic and technical strengths but also 
     **creativity, communication, leadership, empathy, physical activity, and practical skills**.

2. Avoid bias toward technology or engineering.  
   - Give equal importance to careers in:
     - **Science & Technology** (engineering, IT, research)  
     - **Arts & Humanities** (literature, history, languages, design, fine arts)  
     - **Commerce & Business** (finance, management, entrepreneurship, accounting)  
     - **Healthcare** (medicine, nursing, psychology, therapy)  
     - **Law & Governance** (lawyer, civil services, public policy)  
     - **Education & Teaching**  
     - **Vocational & Skilled Trades** (culinary arts, fashion, mechanics, electrical work)  
     - **Sports & Fitness**  
     - **Media & Communication** (journalism, filmmaking, content creation)  
     - **Social Services & NGOs**  

3. Generate a structured response:
   - "careerSuggestion": A single best-fit career or academic stream (e.g., "Teaching", "Medicine", "Commerce - Finance").  
   - "reasoning": A short explanation (3–4 sentences) why this career is recommended based on the student’s responses.  
   - "alternativeOptions": 2–3 other possible career paths (different domains, not just variations of the same one).  
   - "studyMaterial": Provide 2–3 **relevant YouTube links** that can help the student explore or prepare for this career path.  
     - The links must be reliable, beginner-friendly, and relevant to the suggested field.  

### Output Format:
Return the response strictly in **JSON format** as:
{
  "career": "string",
  "reasoning": "string",
  "alternativeOptions": ["string1", "string2", "string3"],
  "studyMaterial": ["https://youtube.com/...", "https://youtube.com/..."]
}
`);

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

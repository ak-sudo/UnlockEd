const dotenv = require("dotenv");
dotenv.config();
const express = require("express");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const cors = require("cors");
const multer = require("multer");
const fs = require("fs");
const path = require("path");

const app = express();
app.use(cors({ origin: "*" }));

const upload = multer({ dest: "uploads/" });

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

    const result =
      await model.generateContent(`The user has completed a career quiz. 
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

    res.json(parsed);
  } catch (err) {
    console.error("Quiz analyze error:", err.message);
    res.status(500).json({ error: "Failed to analyze answers" });
  }
});

app.post(
  "/api/placement/analyze",
  upload.single("resume"),
  async (req, res) => {
    try {
      const { name, gpa, dreamCompany, domain } = req.body;
      const resumeFile = req.file;

      // Optional: Extract resume text (plain text expected, not PDF/Doc parsing here)
      let resumeText = "";
      if (resumeFile) {
        try {
          resumeText = fs.readFileSync(
            path.join(resumeFile.destination, resumeFile.filename),
            "utf-8"
          );
        } catch (err) {
          console.warn("Could not read resume text, continuing...");
        }
      }

      // 🔹 Detailed prompt
      const prompt = `
You are an AI Placement Mentor. Analyze the following student's details and return actionable insights in **strict JSON only**.

STUDENT DATA:
- Name: ${name}
- GPA: ${gpa}
- Dream Company: ${dreamCompany}
- Domain: ${domain}
- Resume: ${resumeText || "Not provided"}

### Instructions:
1. Suggest "career roles" suitable for this candidate.
2. Perform "gap analysis": missing/weak skills that should be improved.
3. Compute a "placement_readiness_index" (0–100).
4. Suggest "top 5 companies" (with short reasoning why).
5. Provide a "skill_score breakdown" (each skill rated 0–10, so frontend can build graphs).
6. Suggest an "action plan" (stepwise).
7. Recommend "mock interview topics".

### Strict JSON Output Example:
{
  "career_match": ["Software Engineer", "Data Analyst"],
  "gap_analysis": ["System Design", "Advanced SQL"],
  "placement_readiness_index": 78,
  "suggested_companies": [
    {"name": "Google", "reason": "Strong in algorithms, high GPA fit"},
    {"name": "Accenture", "reason": "Good for consulting + domain"},
    {"name": "Infosys", "reason": "Training + large intake"},
    {"name": "Cisco", "reason": "Domain match: Networking"},
    {"name": "Deloitte", "reason": "Consulting + analytics domain"}
  ],
  "skill_scores": {
    "DSA": 7,
    "OOPs": 6,
    "Databases": 5,
    "System Design": 4,
    "Communication": 8
  },
  "action_plan": [
    "Complete 50 LeetCode problems in 30 days",
    "Build 1 domain-specific project",
    "Revise DBMS & OS fundamentals"
  ],
  "mock_interview_topics": ["OOPs", "SQL Joins", "System Design Basics"]
}
`;

      const result = await model.generateContent(prompt);
      let analysis = result.response.text();

      analysis = analysis
        .replace(/```json/gi, "")
        .replace(/```/g, "")
        .trim();

      // Parse safely
      const parsed = JSON.parse(analysis);

      res.json({ success: true, analysis: parsed });

    } catch (err) {
      console.error("Error in /placement/analyze:", err.message);
      res.status(500).json({ success: false, error: "Analysis failed" });
    }
  }
);

app.post("/api/placement/company-info", async (req, res) => {
  try {
    const { companyName, candidateContext } = req.body || {};

    if (!companyName)
      return res
        .status(400)
        .json({ success: false, message: "companyName is required" });

    // 3️⃣ Prompt for structured JSON
    const prompt = `
You are a concise hiring advisor. Produce EXACTLY a JSON object matching this schema:

{
  "overview": string,
  "roles": [string],
  "interview_format": string,
  "tips": [string],
  "apply_link": string,
  "required_skills": [string],
  "locations": [string],
  "approx_compensation": string,
  "notes": string
}

Company name: "${companyName}"
Candidate context (may be empty): ${JSON.stringify(candidateContext || {})}

Return valid JSON only.
`;

    const response = await model.generateContent(prompt);

    let analysis = response.response.text();

    analysis = analysis
      .replace(/```json/gi, "")
      .replace(/```/g, "")
      .trim();

    let parsed = JSON.parse(analysis);

    res.json({ success: true, company_info: parsed });
  } catch (err) {
    console.error("company-info error:", err);
    return res.status(500).json({
      success: false,
      message: "Server error while fetching company info",
    });
  }
});

app.listen(3000, () => console.log("Server running on port 3000"));

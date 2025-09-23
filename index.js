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

app.post("/api/resume/enhance", async (req, res) => {
  try {
    const resumeData = req.body;

    const prompt = `
You are a professional resume writer.
Here is a user's raw resume data in JSON:
${JSON.stringify(resumeData, null, 2)}

Task:
1. Rewrite and enhance the summary to make it professional and ATS-friendly.
2. Improve role descriptions in "experience" to be impactful with action verbs and measurable outcomes.
3. Refine "projects" to highlight achievements, technologies, and impact.
4. Suggest better phrasing for skills and achievements.

Return the enhanced resume in JSON format, keeping the same structure:
{
  "name": "",
  "title": "",
  "email": "",
  "phone": "",
  "summary": "",
  "skills": [],
  "experience": [{ "role": "", "company": "", "duration": "", "description": "" }],
  "education": [{ "degree": "", "institution": "", "duration": "" }],
  "projects": [{ "name": "", "description": "" }],
  "achievements": []
}
    `;

    const result = await model.generateContent(prompt);

    const resp = result.response
      .text()
      .replace(/```json|```/g, "")
      .trim();
    const parsed = JSON.parse(resp);

    let enhancedResume;
    try {
      enhancedResume = parsed
    } catch (err) {
      console.error("Gemini response parsing failed:", resp);
      return res.status(500).json({ error: "AI response parsing failed" });
    }

    res.json(enhancedResume);
  } catch (error) {
    console.error("Enhancement error:", error);
    res.status(500).json({ error: "Resume enhancement failed" });
  }
});

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

app.get("/api/gyan/quiz", async (req, res) => {
  console.log("Received request for /api/gyan/quiz");
  try {
    const prompt = `
   Generate 20 career interest quiz questions for Indian school students from class 6 to 12 (ages 11-18).

Questions should cover a wide range of fields, not just technology. Include arts, commerce, law, medicine, teaching, journalism, sports, entrepreneurship, etc.

Each question should be simple, unbiased, and easy to understand for ages 11-18.

Respond in JSON format as a list of objects with the following fields:

id (string): unique question number

question (short, clean text)

category (string): the broad career domain the question relates to (e.g., coding, arts, commerce, law, medicine, teaching, journalism, sports, entrepreneurship, etc.)
    Example:
    [
      {"id":"1","question":"Do you enjoy solving puzzles and coding challenges?","category":"coding"},
      {"id":"2","question":"Do you like creating paintings or designing posters?","category":"arts"}
      ... etc
    ]
    Ensure all questions are engaging, unbiased, and suitable for school students.
    `;

    const result = await model.generateContent(prompt);
    let text = result.response.text();
    text = result.response
      .text()
      .replace(/```json|```/g, "")
      .trim();
    const parsed = JSON.parse(text);

    // Try parsing JSON from Gemini
    let questions;
    try {
      questions = parsed;
    } catch (e) {
      console.error("Parsing error:", e.message);
      return res
        .status(500)
        .json({ success: false, error: "Failed to parse Gemini response" });
    }

    res.json({ success: true, total: questions.length, questions });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: "Server error" });
  }
});

app.post("/api/gyan/roadmaps", async (req, res) => {
  try {
    const { student, quizAnswers } = req.body;

    const prompt = `
You are a career guidance expert for Indian school students. Based on the following student profile and quiz answers, generate 10 career roadmaps that are relevant, realistic, and unbiased.

Student Profile:
${JSON.stringify(student)}

Quiz Answers:
${JSON.stringify(quizAnswers)}

Each career roadmap must include the following fields:
- id (string): unique identifier for the career path
- title (string): career path name
- stream_suggestion (string): recommended stream in school (Arts, Science, Commerce, etc.)
- summary (short description of the career path)
- recommended_for_grades (object): { "min": number, "max": number } indicating suitable school grades
- courses (array of objects) each including:
  - name (string)
  - level (string, e.g., beginner, diploma, undergraduate, postgraduate)
  - duration_years (number)
  - description (short text)
  - outcome (object): { "skills": [string], "roles": [string], "expected_salary_range": string }
- course_recommendations_post_12th (array of course names)
- graph_demand (object): { "labels": [years], "values": [numbers] } showing demand forecast over time
- icons (object): { "main": string } (suggest an icon keyword, e.g., "AiFillRobot")
- confidence (number between 0 and 1, indicating how well the career matches the student profile)

Instructions:
1. Respond strictly as a JSON array containing exactly 10 objects.
2. Ensure all career paths are age-appropriate, unbiased, and aligned with Indian education standards.
3. Include diverse career fields (arts, commerce, science, law, medicine, teaching, entrepreneurship, journalism, sports, technology, etc.).
4. Use realistic course names, durations, skills, and roles relevant to India.
5. graph_demand should reflect future demand trends (can be approximate but realistic).
6. Make JSON well-structured and ready to use in a career guidance application.

    `;

    const result = await model.generateContent(prompt);
    let text = result.response.text();
    text = result.response
      .text()
      .replace(/```json|```/g, "")
      .trim();
    const parsed = JSON.parse(text);

    let roadmaps;
    try {
      roadmaps = parsed;
    } catch (e) {
      console.error("Parsing error:", e.message);
      return res
        .status(500)
        .json({ success: false, error: "Failed to parse Gemini response" });
    }

    res.json({ success: true, roadmaps });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: "Server error" });
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

app.post('/generate-pdf', (req, res) => {
    const resumeData = req.body;

    // Helper function to generate HTML for a section
    const generateHtmlForSection = (title, items) => {
        if (!items || items.length === 0) return '';
        
        return `
            <h4 style="font-weight: bold; margin-top: 15px;">${title}</h4>
            ${items.map(item => `
                <div style="margin-top: 8px;">
                    <p style="font-weight: bold;">${item.title || ''}${item.company ? ` - ${item.company}` : ''}</p>
                    ${item.duration ? `<p style="font-size: 12px; color: #555;">${item.duration}</p>` : ''}
                    <ul style="margin-left: 20px; padding: 0;">
                        ${item.bullets.map(bullet => `
                            <li>${bullet}</li>
                        `).join('')}
                    </ul>
                </div>
            `).join('')}
        `;
    };

    // Constructing the HTML content for the PDF
    const htmlContent = `
        <div style="font-family: Arial, sans-serif; padding: 20px; border: 1px solid #ccc; max-width: 800px; margin: auto;">
            <h3 style="font-size: 24px; font-weight: bold; margin-bottom: 5px;">${resumeData.name}</h3>
            <p style="font-size: 14px; color: #555;">${resumeData.role} - ${resumeData.email} - ${resumeData.phone}</p>
            <p style="margin-top: 10px;">${resumeData.summary}</p>
            
            ${generateHtmlForSection('Experience', resumeData.experience)}
            ${generateHtmlForSection('Projects', resumeData.projects)}

            ${resumeData.skills && resumeData.skills.length > 0 ? `
                <h4 style="font-weight: bold; margin-top: 15px;">Skills</h4>
                <p>${resumeData.skills.join(', ')}</p>
            ` : ''}
        </div>
    `;

    // PDF options
    const options = { format: 'A4', orientation: 'portrait' };

    // Create PDF from HTML string
    pdf.create(htmlContent, options).toBuffer((err, buffer) => {
        if (err) {
            console.error("PDF creation error:", err);
            return res.status(500).send('Error generating PDF');
        }
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', 'attachment; filename=resume.pdf');
        res.send(buffer);
    });
});

app.listen(3000, () => console.log("Server running on port 3000"));

import express from "express";
import bodyParser from "body-parser";
import Groq from "groq-sdk";
import nodemailer from "nodemailer";
import fs from "fs";
import path from "path";
import { config as configDotenv } from "dotenv";
import multer from "multer";
import { fileURLToPath } from "url";

// Fix for ES modules: Define __dirname and __filename
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
configDotenv();

// Configure Nodemailer transporter
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST, // e.g., "smtp.gmail.com"
  port: process.env.SMTP_PORT || 587, // 587 for TLS, 465 for SSL
  secure: false, // Use true for port 465
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});
const requiredEnv = ["SMTP_HOST", "SMTP_PORT", "SMTP_USER", "SMTP_PASS"];
for (const envVar of requiredEnv) {
  if (!process.env[envVar]) {
    console.error(`Missing required environment variable: ${envVar}`);
    process.exit(1);
  }
}

transporter.verify((error, success) => {
  if (error) {
    console.error("SMTP connection error:", error.message || error);
  } else {
    console.log("SMTP connection successful");
  }
});

// Function to send email with attachment
async function sendEmail(to, analysis, commitHash, attachments) {
  const message = {
    from: process.env.SMTP_USER,
    to,
    subject: `Code Analysis and Commit Report - ${commitHash.substring(0, 7)}`,
    text: `Analysis: ${analysis}\nCommit Hash: ${commitHash}`,
    attachments,
  };
  return transporter.sendMail(message);
}

// Initialize Express app
const app = express();
app.use(bodyParser.json());

// Check for required API keys at startup
if (!process.env.GROQ_API_KEY) {
  console.error("API key for Groq is missing.");
  process.exit(1);
}

// Initialize Groq service
const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

// Helper to determine file extension based on language
function getFileExtension(language) {
  const languageMap = {
    javascript: ".js",
    python: ".py",
    java: ".java",
    "c++": ".cpp",
    typescript: ".ts",
    html: ".html",
    css: ".css",
  };
  return languageMap[language.toLowerCase()] || ".txt";
}

// Analyze commit and get language, modified code, and explanations
async function analyzeCommit(commitMessage, diff) {
  try {
    const response = await groq.chat.completions.create({
      messages: [
        {
          role: "system",
          content:
            "You are a senior developer. Review the commit and propose code improvements.",
        },
        {
          role: "user",
          content: `Analyze this commit:\nMessage: ${commitMessage}\nChanges:\n${diff}`,
        },
      ],
      model: "llama3-8b-8192",
      temperature: 0.7,
      max_tokens: 1000,
    });

    const content = response.choices[0]?.message?.content;
    const languageMatch = content.match(/Language:\s*(\w+)/i);
    const language = languageMatch ? languageMatch[1] : "text";
    const extension = getFileExtension(language);

    const modifiedCode =
      content.match(/```(?:[\w]*)\n([\s\S]*?)```/i)?.[1] || "";
    const explanation = content.replace(/```[\s\S]*?```/g, "").trim();

    return { modifiedCode, explanation, extension };
  } catch (error) {
    console.error(
      "Error analyzing commit:",
      error.response ? error.response.data : error
    );
    return {
      modifiedCode: "",
      explanation: "Unable to analyze commit",
      extension: ".txt",
    };
  }
}

// Extract corrected code if available from analysis content
function extractCorrectedCode(analysisContent) {
  const codeMatch = analysisContent.match(/```[\s\S]*?```/);
  return codeMatch ? codeMatch[0].replace(/```/g, "").trim() : null;
}



// Webhook endpoint
app.post("/webhook", async (req, res) => {
  // Get the latest commit from the webhook payload
  const { commits } = req.body;
  if (!commits || commits.length === 0) {
    return res.status(400).send("No commits found in the payload");
  }

  // Get the most recent commit (the first one in the list is the latest in most cases)
  const commit = commits[0]; // Assuming the commits array is ordered with the most recent commit first
  const {
    id: commitHash,
    message: commitMessage,
    author,
    added,
    modified,
  } = commit;
  const committerEmail = author.email;
  const fileChanges = added.concat(modified); // All changed files

  let analysisContent = ""; // Define analysisContent here

  const attachments = []; // Array to hold multiple attachments

  // Process each file change in the most recent commit
  for (const file of fileChanges) {
    const extension = path.extname(file) || ".txt";
    const modifiedCode = `// Changes in ${file}\n...actual file diff content here...\n`;

    // Perform code analysis
    const analysis = await groq.chat.completions.create({
      messages: [
        {
          role: "system",
          content:
            "You are an expert reviewing code changes. Provide improvements if needed.",
        },
        {
          role: "user",
          content: `Commit message: ${commitMessage}\nChanges in ${file}:\n${modifiedCode}\nPlease suggest corrections if applicable.`,
        },
      ],
      model: "llama3-8b-8192",
      temperature: 0.7,
      max_tokens: 500,
    });

    const content =
      analysis.choices[0]?.message?.content || "No analysis available";
    analysisContent += `Analysis for ${file}:\n${content}\n\n`; // Concatenate the analysis for each file

    const correctedCode = extractCorrectedCode(content) || modifiedCode;

    const filePath = path.join(
      __dirname,
      `corrected_${path.basename(file)}_${commitHash.substring(
        0,
        7
      )}${extension}`
    );
    fs.writeFileSync(filePath, correctedCode);

    attachments.push({
      filename: path.basename(filePath),
      content: fs.readFileSync(filePath).toString("base64"),
      encoding: "base64",
      contentType: "text/plain",
    });

    fs.unlinkSync(filePath);
  }

  // After processing the most recent commit, send the email with all the collected analysis content
  try {
    await sendEmail(committerEmail, analysisContent, commitHash, attachments);
    res
      .status(200)
      .send("Webhook processed and email sent for the latest commit.");
  } catch (error) {
    console.error("Error sending email:", error.message || error);
    res.status(500).send("Error processing the webhook.");
  }
});

// Test email endpoint
app.post("/test-email", async (req, res) => {
  const testEmail = "dtakouessa@gmail.com";
  const testAnalysis = "Test analysis content for debugging.";
  const testCommitHash = "1234567";
  const testCorrectedCode = "console.log('Hello World!');";
  const testExtension = ".txt";

  const filePath = path.join(__dirname, `test_file${testExtension}`);
  fs.writeFileSync(filePath, testCorrectedCode);

  const attachments = [
    {
      filename: `test_file.txt`, // use .txt as a neutral extension
      content: Buffer.from("Test attachment content").toString("base64"), // basic content
      encoding: "base64",
      contentType: "text/plain",
    },
  ];

  try {
    await sendEmail(testEmail, testAnalysis, testCommitHash, attachments);
    res.status(200).send("Test email sent successfully!");
  } catch (error) {
    console.error("Error sending test email:", error.message || error);
    res.status(500).send("Error sending test email.");
  } finally {
    fs.unlinkSync(filePath);
  }
});

// Start server on specified port
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

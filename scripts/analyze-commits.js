import Groq from "groq-sdk";
import sgMail from "@sendgrid/mail";
import { execSync } from "child_process";
import { configDotenv } from "dotenv";
import fs from "fs";
import path from "path";

// Load environment variables from .env file
configDotenv();
console.log("GROQ_API_KEY:", process.env.GROQ_API_KEY);

// Initialize Groq
const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

// Initialize SendGrid
sgMail.setApiKey(process.env.SENDGRID_API_KEY);

// Determine file extension based on detected language from commit message or diff content
function getFileExtension(language) {
  const languageMap = {
    javascript: ".js",
    python: ".py",
    java: ".java",
    "c++": ".cpp",
    typescript: ".ts",
    html: ".html",
    css: ".css",
    // Add more mappings as needed
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
    console.log("AI Analysis Content:", content);

    // Parse response for language, modified code, and explanation
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

// Send email with file attachment
async function sendEmail(
  to,
  analysis,
  commitHash,
  modifiedCode,
  explanation,
  extension
) {
  const filePath = path.join(
    __dirname,
    `commit_${commitHash.substring(0, 7)}${extension}`
  );
  fs.writeFileSync(filePath, modifiedCode);

  const msg = {
    to,
    from: process.env.SENDGRID_VERIFIED_SENDER,
    subject: `Commit Analysis Report - ${commitHash.substring(0, 7)}`,
    text: explanation,
    html: `<p>${explanation.replace(/\n/g, "<br>")}</p>`,
    attachments: [
      {
        content: fs.readFileSync(filePath).toString("base64"),
        filename: `commit_${commitHash.substring(0, 7)}${extension}`,
        type: "text/plain",
        disposition: "attachment",
      },
    ],
  };

  try {
    await sgMail.send(msg);
    console.log(`Email sent successfully for commit ${commitHash}`);
  } catch (error) {
    console.error("Error sending email:", error);
  } finally {
    fs.unlinkSync(filePath); // Delete temp file
  }
}

// Get commits and trigger analysis only during GitHub Actions
async function getCommits() {
  if (process.env.GITHUB_EVENT_PATH) {
    const event = JSON.parse(
      fs.readFileSync(process.env.GITHUB_EVENT_PATH, "utf8")
    );
    return event.commits || [];
  } else {
    return [];
  }
}

async function main() {
  const commits = await getCommits();

  for (const commit of commits) {
    const commitHash = commit.id;
    const commitMessage = commit.message;
    const committerEmail = commit.author.email;

    const diff = execSync(`git show --patch ${commitHash}`).toString();
    const { modifiedCode, explanation, extension } = await analyzeCommit(
      commitMessage,
      diff
    );

    await sendEmail(
      committerEmail,
      explanation,
      commitHash,
      modifiedCode,
      explanation,
      extension
    );
  }
}

main().catch(console.error);

import OpenAI from "openai";
import sgMail from "@sendgrid/mail";
import { execSync } from "child_process";
import { configDotenv } from "dotenv";
import fs from "fs";

// Load environment variables from .env file
configDotenv();

// Initialize OpenAI
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  organization: "org-FRrNtl6eAOH5jh47V5nQwvnb",
});

// Initialize SendGrid
sgMail.setApiKey(process.env.SENDGRID_API_KEY);

async function analyzeCommit(commitMessage, diff) {
  try {
    const response = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [
        {
          role: "system",
          content:
            "You are a senior developer reviewing commits. Provide constructive feedback on commit messages and changes.",
        },
        {
          role: "user",
          content: `Analyze this commit:\nMessage: ${commitMessage}\nChanges:\n${diff}`,
        },
      ],
      temperature: 0.7,
      max_tokens: 500,
    });

    return response.choices[0]?.message.content;
  } catch (error) {
    console.error("Error analyzing commit:", error);
    return "Unable to analyze commit";
  }
}

async function sendEmail(to, analysis, commitHash) {
  const msg = {
    to,
    from: process.env.SENDGRID_VERIFIED_SENDER, // Must be verified in SendGrid
    subject: `Commit Analysis Report - ${commitHash.substring(0, 7)}`,
    text: analysis,
    html: analysis.replace(/\n/g, "<br>"),
  };

  try {
    await sgMail.send(msg);
    console.log(`Email sent successfully for commit ${commitHash}`);
  } catch (error) {
    console.error("Error sending email:", error);
  }
}

async function getCommits() {
  // Check if we're running in GitHub Actions
  if (process.env.GITHUB_EVENT_PATH) {
    const eventPath = process.env.GITHUB_EVENT_PATH;
    const event = JSON.parse(fs.readFileSync(eventPath, "utf8"));
    return event.commits || [];
  } else {
    // If running locally, get the latest commit data
    const commitHash = execSync("git rev-parse HEAD").toString().trim();
    const commitMessage = execSync("git log -1 --pretty=%B").toString().trim();
    const committerEmail = execSync("git log -1 --pretty=%ae")
      .toString()
      .trim();

    return [
      {
        id: commitHash,
        message: commitMessage,
        author: { email: committerEmail },
      },
    ];
  }
}

async function main() {
  const commits = await getCommits();

  for (const commit of commits) {
    const commitHash = commit.id;
    const commitMessage = commit.message;
    const committerEmail = commit.author.email;

    // Get the diff for each commit
    const diff = execSync(`git show --patch ${commitHash}`).toString();

    // Analyze commit
    const analysis = await analyzeCommit(commitMessage, diff);

    // Send email to committer
    await sendEmail(committerEmail, analysis, commitHash);
  }
}

main().catch(console.error);
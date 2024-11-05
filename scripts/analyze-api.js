import express from "express";
import bodyParser from "body-parser";
import Groq from "groq-sdk"; 
import sgMail from "@sendgrid/mail";
import fs from "fs";
import path from "path";
import { configDotenv } from "dotenv";

configDotenv();

// Initialize Express app
const app = express();
app.use(bodyParser.json());

// Initialize Groq or Llama AI service
const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

// Initialize SendGrid
sgMail.setApiKey(process.env.SENDGRID_API_KEY);

app.post("/webhook", async (req, res) => {
  const { commits, repository } = req.body;

  for (const commit of commits) {
    const {
      id: commitHash,
      message: commitMessage,
      author,
      added,
      modified,
    } = commit;
    const committerEmail = author.email;
    const fileChanges = added.concat(modified); // All changed files

    let modifiedCode = ""; // Placeholder for diff code

    // Retrieve and analyze the modified code
    for (const file of fileChanges) {
      const extension = path.extname(file);

      // Simulate fetching diff, e.g., via `git show` in a real setup
      modifiedCode += `// Changes in ${file}\n...file diff content here...`;
    }

    // Analyze commit using Groq or Llama
    const analysis = await groq.chat.completions.create({
      messages: [
        {
          role: "system",
          content: "You are an expert reviewing code changes.",
        },
        {
          role: "user",
          content: `Commit message: ${commitMessage}\nChanges:\n${modifiedCode}`,
        },
      ],
      model: "llama3-8b-8192",
      temperature: 0.7,
      max_tokens: 500,
    });

    const analysisContent =
      analysis.choices[0]?.message?.content || "No analysis available";

    // Send email with analysis and attachments
    await sendEmail(
      committerEmail,
      analysisContent,
      commitHash,
      modifiedCode,
      extension
    );
  }

  res.status(200).send("Webhook received");
});

// Function to send the email with the modified file attached
async function sendEmail(to, analysis, commitHash, modifiedCode, extension) {
  const filePath = path.join(
    __dirname,
    `commit_${commitHash.substring(0, 7)}${extension}`
  );
  fs.writeFileSync(filePath, modifiedCode);

  const msg = {
    to,
    from: process.env.SENDGRID_VERIFIED_SENDER,
    subject: `Commit Analysis Report - ${commitHash.substring(0, 7)}`,
    text: analysis,
    html: `<p>${analysis.replace(/\n/g, "<br>")}</p>`,
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
    fs.unlinkSync(filePath);
  }
}

// Start server on specified port
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

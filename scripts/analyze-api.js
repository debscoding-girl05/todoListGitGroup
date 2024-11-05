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

// Check for API keys at startup
if (!process.env.GROQ_API_KEY || !process.env.SENDGRID_API_KEY) {
  console.error("API keys for Groq and/or SendGrid are missing.");
  process.exit(1);
}

// Initialize Groq or Llama AI service
const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

// Initialize SendGrid
sgMail.setApiKey(process.env.SENDGRID_API_KEY);

app.post("/webhook", async (req, res) => {
  const { commits } = req.body;

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

    const attachments = []; // Array to hold multiple attachments

    for (const file of fileChanges) {
      const extension = path.extname(file) || ".txt"; // Default to .txt if no extension

      // Simulate fetching diff content; replace this with real diff content retrieval
      const modifiedCode = `// Changes in ${file}\n...actual file diff content here...\n`;

      // Analyze the code with Groq/Llama and request corrections
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

      const analysisContent =
        analysis.choices[0]?.message?.content || "No analysis available";
      const correctedCode =
        extractCorrectedCode(analysisContent) || modifiedCode;

      // Save the corrected code to a temporary file with the appropriate extension
      const filePath = path.join(
        __dirname,
        `corrected_${path.basename(file)}_${commitHash.substring(
          0,
          7
        )}${extension}`
      );
      fs.writeFileSync(filePath, correctedCode);

      // Attach the file
      attachments.push({
        content: fs.readFileSync(filePath).toString("base64"),
        filename: path.basename(filePath),
        type: "text/plain",
        disposition: "attachment",
      });

      // Clean up the temporary file after it's read into memory
      fs.unlinkSync(filePath);
    }

    // Send email with analysis and file attachments
    await sendEmail(committerEmail, analysisContent, commitHash, attachments);
  }

  res.status(200).send("Webhook received");
});

// Function to extract corrected code if available from analysis content
function extractCorrectedCode(analysisContent) {
  const codeMatch = analysisContent.match(/```[\s\S]*?```/);
  return codeMatch ? codeMatch[0].replace(/```/g, "").trim() : null;
}

// Function to send the email with multiple attachments
async function sendEmail(to, analysis, commitHash, attachments) {
  const msg = {
    to,
    from: process.env.SENDGRID_VERIFIED_SENDER,
    subject: `Commit Analysis Report - ${commitHash.substring(0, 7)}`,
    text: analysis,
    html: `<p>${analysis.replace(/\n/g, "<br>")}</p>`,
    attachments, // Attachments array with multiple files
  };

  try {
    await sgMail.send(msg);
    console.log(`Email sent successfully for commit ${commitHash}`);
  } catch (error) {
    console.error("Error sending email:", error);
  }
}

// Start server on specified port
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

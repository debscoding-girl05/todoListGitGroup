import { Configuration, OpenAIApi } from "openai";
import sgMail from "@sendgrid/mail";
import { execSync } from "child_process";

// Initialize OpenAI
const configuration = new Configuration({
  apiKey: process.env.OPENAI_API_KEY,
});
const openai = new OpenAIApi(configuration);

// Initialize SendGrid
sgMail.setApiKey(process.env.SENDGRID_API_KEY);

async function analyzeCommit(commitMessage, diff) {
  try {
    const response = await openai.createChatCompletion({
      model: "gpt-4",
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

    return response.data.choices[0].message.content;
  } catch (error) {
    console.error("Error analyzing commit:", error);
    return "Unable to analyze commit";
  }
}

async function sendEmail(to, analysis) {
  const msg = {
    to,
    from: process.env.SENDGRID_VERIFIED_SENDER, 
    subject: "Commit Analysis Report",
    text: analysis,
    html: analysis.replace(/\n/g, "<br>"),
  };

  try {
    await sgMail.send(msg);
    console.log("Email sent successfully");
  } catch (error) {
    console.error("Error sending email:", error);
  }
}

async function main() {
  // Get latest commit info
  const commitHash = execSync("git rev-parse HEAD").toString().trim();
  const commitMessage = execSync("git log -1 --pretty=%B").toString().trim();
  const diff = execSync("git show --patch").toString();

  // Get committer email
  const committerEmail = execSync("git log -1 --pretty=%ae").toString().trim();

  // Analyze commit
  const analysis = await analyzeCommit(commitMessage, diff);

  // Send email to committer
  await sendEmail(committerEmail, analysis);
}

main().catch(console.error);

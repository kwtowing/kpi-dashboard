// Provider-agnostic email wrapper. Which provider is live is chosen with
// the EMAIL_PROVIDER env var ('resend' | 'sendgrid') — both are wired to
// their real HTTP APIs directly (no SDK dependency needed), since Phase 5
// shipped without confirming which account KW Towing holds. Set whichever
// API key matches EMAIL_PROVIDER as a Vercel environment variable, never
// in code.

export class EmailNotConfigured extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EmailNotConfigured";
  }
}

export interface SendEmailArgs {
  to: string[];
  subject: string;
  html: string;
}

export async function sendEmail({ to, subject, html }: SendEmailArgs): Promise<void> {
  const provider = (process.env.EMAIL_PROVIDER || "").toLowerCase();
  const from = process.env.ALERT_EMAIL_FROM;
  if (!from) {
    throw new EmailNotConfigured("ALERT_EMAIL_FROM is not set");
  }

  if (provider === "resend") {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) throw new EmailNotConfigured("RESEND_API_KEY is not set");
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from, to, subject, html }),
    });
    if (!res.ok) {
      throw new Error(`Resend API error ${res.status}: ${await res.text()}`);
    }
    return;
  }

  if (provider === "sendgrid") {
    const apiKey = process.env.SENDGRID_API_KEY;
    if (!apiKey) throw new EmailNotConfigured("SENDGRID_API_KEY is not set");
    const res = await fetch("https://api.sendgrid.com/v3/mail/send", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        personalizations: [{ to: to.map((email) => ({ email })) }],
        from: { email: from },
        subject,
        content: [{ type: "text/html", value: html }],
      }),
    });
    if (!res.ok) {
      throw new Error(`SendGrid API error ${res.status}: ${await res.text()}`);
    }
    return;
  }

  throw new EmailNotConfigured(
    "EMAIL_PROVIDER is not set to 'resend' or 'sendgrid'"
  );
}

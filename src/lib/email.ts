// Provider-agnostic email wrapper. Which provider is live is chosen with
// the EMAIL_PROVIDER env var ('resend' | 'sendgrid' | 'gmail') — resend and
// sendgrid are wired to their real HTTP APIs directly (no SDK dependency
// needed); gmail uses nodemailer over Gmail's SMTP, for KW Towing's case of
// not holding a Resend/SendGrid account and wanting to use an existing
// Gmail address instead. Set whichever credentials match EMAIL_PROVIDER as
// a Vercel environment variable, never in code.

import nodemailer from "nodemailer";

declare global {
  // eslint-disable-next-line no-var
  var _gmailTransport: ReturnType<typeof nodemailer.createTransport> | undefined;
}

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

  if (provider === "resend" || provider === "sendgrid") {
    const from = process.env.ALERT_EMAIL_FROM;
    if (!from) throw new EmailNotConfigured("ALERT_EMAIL_FROM is not set");
    return sendViaHttpProvider(provider, from, to, subject, html);
  }

  if (provider === "gmail") {
    const user = process.env.GMAIL_USER;
    const pass = process.env.GMAIL_APP_PASSWORD;
    if (!user || !pass) {
      throw new EmailNotConfigured("GMAIL_USER and GMAIL_APP_PASSWORD must both be set");
    }
    // Gmail's SMTP rejects (or silently rewrites) a From address that
    // isn't the authenticated account or one of its verified aliases, so
    // this ignores ALERT_EMAIL_FROM and always sends as GMAIL_USER.
    if (!global._gmailTransport) {
      global._gmailTransport = nodemailer.createTransport({
        service: "gmail",
        auth: { user, pass },
      });
    }
    await global._gmailTransport.sendMail({ from: user, to: to.join(", "), subject, html });
    return;
  }

  throw new EmailNotConfigured(
    "EMAIL_PROVIDER is not set to 'resend', 'sendgrid', or 'gmail'"
  );
}

async function sendViaHttpProvider(
  provider: "resend" | "sendgrid",
  from: string,
  to: string[],
  subject: string,
  html: string
): Promise<void> {
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
  }
}

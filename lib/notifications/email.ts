import nodemailer from "nodemailer";

export type TransactionalEmail = {
  to: string;
  subject: string;
  text: string;
  messageId?: string;
};

export interface EmailProvider {
  send(message: TransactionalEmail): Promise<void>;
}

export function smtpConnectionOptions(address: string, production: boolean) {
  const url = new URL(address);
  if (
    !["smtp:", "smtps:"].includes(url.protocol) ||
    !url.hostname ||
    url.search ||
    url.hash ||
    !["", "/"].includes(url.pathname)
  )
    throw new Error("Invalid SMTP configuration");
  return {
    url: url.toString(),
    connectionTimeout: 5000,
    greetingTimeout: 5000,
    socketTimeout: 10000,
    requireTLS: production,
    tls: { rejectUnauthorized: true },
    disableFileAccess: true,
    disableUrlAccess: true,
    logger: false,
    debug: false,
  };
}

class SmtpEmailProvider implements EmailProvider {
  private transport = nodemailer.createTransport(
    smtpConnectionOptions(
      process.env.SMTP_URL!,
      process.env.DEPLOYMENT_MODE === "production",
    ),
  );

  async send(message: TransactionalEmail) {
    await this.transport.sendMail({
      ...message,
      from: process.env.EMAIL_FROM ?? "Поступай <noreply@localhost>",
    });
  }
}

class DisabledEmailProvider implements EmailProvider {
  async send() {
    throw new Error("SMTP_URL is required to send email");
  }
}

export function getEmailProvider(): EmailProvider {
  return process.env.SMTP_URL
    ? new SmtpEmailProvider()
    : new DisabledEmailProvider();
}

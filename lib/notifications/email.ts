import nodemailer from "nodemailer";

export type TransactionalEmail = {
  to: string;
  subject: string;
  text: string;
};

export interface EmailProvider {
  send(message: TransactionalEmail): Promise<void>;
}

class SmtpEmailProvider implements EmailProvider {
  private transport = nodemailer.createTransport(process.env.SMTP_URL!);

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

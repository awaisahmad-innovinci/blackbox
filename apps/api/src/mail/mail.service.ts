import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);

  constructor(private readonly config: ConfigService) {}

  async sendPasswordResetOtp(to: string, code: string): Promise<void> {
    const ttlSeconds = Number(
      this.config.get("PASSWORD_RESET_OTP_TTL_SECONDS") ?? 600,
    );
    const expiryMinutes = Math.max(1, Math.round(ttlSeconds / 60));
    await this.sendOtp(to, {
      subject: "Your Blackbox password reset code",
      html: `
      <p>Use this code to reset your Blackbox owner password:</p>
      <p style="font-size:24px;font-weight:bold;letter-spacing:0.2em">${code}</p>
      <p>This code expires in ${expiryMinutes} minute${expiryMinutes === 1 ? "" : "s"}. If you did not request a reset, you can ignore this email.</p>
    `.trim(),
      devLog: `password reset OTP for ${to}: ${code}`,
    });
  }

  async sendEmailVerificationOtp(to: string, code: string): Promise<void> {
    const expiryMinutes = 10;
    await this.sendOtp(to, {
      subject: "Confirm your Blackbox email",
      html: `
      <p>Use this code to confirm that this mailbox can receive Blackbox email:</p>
      <p style="font-size:24px;font-weight:bold;letter-spacing:0.2em">${code}</p>
      <p>This code expires in ${expiryMinutes} minutes. If you did not expect it, you can ignore this email.</p>
    `.trim(),
      devLog: `email verification OTP for ${to}: ${code}`,
    });
  }

  private async sendOtp(
    to: string,
    message: { subject: string; html: string; devLog: string },
  ): Promise<void> {
    const apiKey = this.config.get<string>("BREVO_API_KEY")?.trim();
    const fromEmail = this.config.get<string>("EMAIL_FROM")?.trim();
    const senderName =
      this.config.get<string>("EMAIL_SENDER_NAME")?.trim() || "Blackbox";
    const subject = message.subject;
    const html = message.html;

    if (!apiKey) {
      const nodeEnv = this.config.get<string>("NODE_ENV") ?? "development";
      if (nodeEnv !== "production") {
        this.logger.warn(`BREVO_API_KEY not set — ${message.devLog}`);
        return;
      }
      throw new Error("Email is not configured");
    }

    if (!fromEmail) {
      throw new Error("EMAIL_FROM is not configured");
    }

    const res = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        "api-key": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        sender: { name: senderName, email: fromEmail },
        to: [{ email: to }],
        subject,
        htmlContent: html,
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      this.logger.error(`Brevo API error ${res.status}: ${body}`);
      throw new Error("Failed to send email");
    }
  }
}

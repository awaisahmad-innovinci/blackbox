import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);

  constructor(private readonly config: ConfigService) {}

  async sendPasswordResetOtp(to: string, code: string): Promise<void> {
    const apiKey = this.config.get<string>("BREVO_API_KEY")?.trim();
    const fromEmail = this.config.get<string>("EMAIL_FROM")?.trim();
    const senderName =
      this.config.get<string>("EMAIL_SENDER_NAME")?.trim() || "Blackbox";
    const ttlSeconds = Number(
      this.config.get("PASSWORD_RESET_OTP_TTL_SECONDS") ?? 600,
    );
    const expiryMinutes = Math.max(1, Math.round(ttlSeconds / 60));
    const subject = "Your Blackbox password reset code";
    const html = `
      <p>Use this code to reset your Blackbox owner password:</p>
      <p style="font-size:24px;font-weight:bold;letter-spacing:0.2em">${code}</p>
      <p>This code expires in ${expiryMinutes} minute${expiryMinutes === 1 ? "" : "s"}. If you did not request a reset, you can ignore this email.</p>
    `.trim();

    if (!apiKey) {
      const nodeEnv = this.config.get<string>("NODE_ENV") ?? "development";
      if (nodeEnv !== "production") {
        this.logger.warn(
          `BREVO_API_KEY not set — password reset OTP for ${to}: ${code}`,
        );
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

import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);

  constructor(private readonly config: ConfigService) {}

  async sendPasswordResetOtp(to: string, code: string): Promise<void> {
    const apiKey = this.config.get<string>("RESEND_API_KEY")?.trim();
    const from =
      this.config.get<string>("EMAIL_FROM")?.trim() ||
      "onboarding@resend.dev";
    const subject = "Your Blackbox password reset code";
    const html = `
      <p>Use this code to reset your Blackbox owner password:</p>
      <p style="font-size:24px;font-weight:bold;letter-spacing:0.2em">${code}</p>
      <p>This code expires in 10 minutes. If you did not request a reset, you can ignore this email.</p>
    `.trim();

    if (!apiKey) {
      const nodeEnv = this.config.get<string>("NODE_ENV") ?? "development";
      if (nodeEnv !== "production") {
        this.logger.warn(
          `RESEND_API_KEY not set — password reset OTP for ${to}: ${code}`,
        );
        return;
      }
      throw new Error("Email is not configured");
    }

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [to],
        subject,
        html,
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      this.logger.error(`Resend API error ${res.status}: ${body}`);
      throw new Error("Failed to send email");
    }
  }
}

/**
 * Email template renderer
 *
 * Each template is a function that accepts variables and returns { subject, html }.
 * All templates share a common base layout wrapper for consistent styling.
 */

function baseLayout(title: string, body: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
</head>
<body style="margin:0;padding:0;background-color:#f4f4f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f7;">
    <tr>
      <td align="center" style="padding:24px 0;">
        <table role="presentation" width="580" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:8px;overflow:hidden;">
          <!-- Header -->
          <tr>
            <td style="background-color:#6366f1;padding:24px 32px;">
              <h1 style="margin:0;color:#ffffff;font-size:20px;font-weight:600;">Small Squaretable</h1>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:32px;">
              ${body}
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding:16px 32px;background-color:#f9fafb;border-top:1px solid #e5e7eb;">
              <p style="margin:0;font-size:12px;color:#9ca3af;text-align:center;">
                &copy; ${new Date().getFullYear()} Small Squaretable. All rights reserved.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

const buttonStyle =
  'display:inline-block;padding:12px 24px;background-color:#6366f1;color:#ffffff;text-decoration:none;border-radius:6px;font-weight:600;font-size:14px;';

type TemplateRenderer = (vars: Record<string, string>) => { subject: string; html: string };

const templates: Record<string, TemplateRenderer> = {
  'email-verification': (vars) => {
    const { link, name } = vars;
    const subject = 'Verify your email';
    const body = `
      <h2 style="margin:0 0 16px;font-size:18px;color:#111827;">Verify your email address</h2>
      <p style="margin:0 0 16px;font-size:14px;color:#374151;line-height:1.6;">
        Hi ${name || 'there'},
      </p>
      <p style="margin:0 0 24px;font-size:14px;color:#374151;line-height:1.6;">
        Please click the button below to verify your email address and activate your account.
      </p>
      <p style="margin:0 0 24px;">
        <a href="${link}" style="${buttonStyle}">Verify Email</a>
      </p>
      <p style="margin:0;font-size:12px;color:#9ca3af;line-height:1.6;">
        If you didn't create an account, you can safely ignore this email.
      </p>`;
    return { subject, html: baseLayout(subject, body) };
  },

  'password-reset': (vars) => {
    const { link, name } = vars;
    const subject = 'Reset your password';
    const body = `
      <h2 style="margin:0 0 16px;font-size:18px;color:#111827;">Reset your password</h2>
      <p style="margin:0 0 16px;font-size:14px;color:#374151;line-height:1.6;">
        Hi ${name || 'there'},
      </p>
      <p style="margin:0 0 24px;font-size:14px;color:#374151;line-height:1.6;">
        We received a request to reset your password. Click the button below to choose a new one.
      </p>
      <p style="margin:0 0 24px;">
        <a href="${link}" style="${buttonStyle}">Reset Password</a>
      </p>
      <p style="margin:0;font-size:12px;color:#9ca3af;line-height:1.6;">
        If you didn't request a password reset, you can safely ignore this email. The link will expire in 1 hour.
      </p>`;
    return { subject, html: baseLayout(subject, body) };
  },

  welcome: (vars) => {
    const { name } = vars;
    const subject = 'Welcome to Small Squaretable';
    const body = `
      <h2 style="margin:0 0 16px;font-size:18px;color:#111827;">Welcome aboard!</h2>
      <p style="margin:0 0 16px;font-size:14px;color:#374151;line-height:1.6;">
        Hi ${name || 'there'},
      </p>
      <p style="margin:0 0 16px;font-size:14px;color:#374151;line-height:1.6;">
        Thanks for joining Small Squaretable. We're excited to have you!
      </p>
      <p style="margin:0;font-size:14px;color:#374151;line-height:1.6;">
        Start by browsing the character marketplace or creating your own character.
      </p>`;
    return { subject, html: baseLayout(subject, body) };
  },
};

/**
 * Render a named email template with the given variables.
 * Throws if the template name is unknown.
 */
export function renderTemplate(
  templateName: string,
  vars: Record<string, string>,
): { subject: string; html: string } {
  const renderer = templates[templateName];
  if (!renderer) {
    throw new Error(`Unknown email template: ${templateName}`);
  }
  return renderer(vars);
}

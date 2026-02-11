import { getEmailTransport } from './transport';
import { renderTemplate } from './templates';
import { config } from '../config';

/**
 * Send an email using a named template.
 *
 * @param to - Recipient email address
 * @param templateName - Template identifier (e.g. 'email-verification')
 * @param vars - Variables to interpolate into the template
 */
export async function sendEmail(
  to: string,
  templateName: string,
  vars: Record<string, string>,
): Promise<void> {
  const { subject, html } = renderTemplate(templateName, vars);
  const transport = getEmailTransport();
  await transport.sendMail({
    from: config.smtpFrom,
    to,
    subject,
    html,
  });
}

export { renderTemplate } from './templates';
export { getEmailTransport, resetEmailTransport } from './transport';

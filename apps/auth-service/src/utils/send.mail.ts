import ejs from "ejs";
import nodeMailer from "nodemailer";
import path from "path";

const transport = nodeMailer.createTransport({
  host: process.env.SMTP_HOST,
  service: process.env.SMTP_SERVICE,
  port: Number(process.env.SMTP_PORT) || 587,
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

const renderEmailTemplate = async (templateName: string, data: { name: string; email: string; otp: string }) => {
  const templatePath = path.join(process.cwd(), "src", "utils", "email-templates", `${templateName}.ejs`);
  const template = await ejs.renderFile(templatePath, data);
  return template;
};
export const sendEmail = async (to: string, subject: string, templateName: string, data: { name: string; email: string; otp: string }) => {
  const emailBody = await renderEmailTemplate(templateName, data);

  try {
    await transport.sendMail({
      from: `<${process.env.SMTP_FROM}>`,
      to,
      subject,
      html: emailBody,
    });
  } catch (error) {
    throw new Error(`Error sending email: ${error}`);
  }
};

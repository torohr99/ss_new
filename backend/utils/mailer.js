const nodemailer = require('nodemailer');

let transporter;

async function initMailer() {
  // Generate test SMTP service account from ethereal.email
  let testAccount = await nodemailer.createTestAccount();

  // create reusable transporter object using the default SMTP transport
  transporter = nodemailer.createTransport({
    host: "smtp.ethereal.email",
    port: 587,
    secure: false, // true for 465, false for other ports
    auth: {
      user: testAccount.user, // generated ethereal user
      pass: testAccount.pass, // generated ethereal password
    },
  });
}

initMailer();

async function sendOTP(email, code) {
  if (!transporter) await initMailer();
  
  let info = await transporter.sendMail({
    from: '"SportSmack Security" <security@sportsmack.com>',
    to: email,
    subject: "Your SportSmack Verification Code",
    text: `Your SportSmack verification code is: ${code}`,
    html: `<b>Your SportSmack verification code is: <span style="font-size:24px">${code}</span></b>`,
  });

  console.log("Message sent: %s", info.messageId);
  // Preview only available when sending through an Ethereal account
  console.log("-----------------------------------------");
  console.log("Preview OTP Email URL: %s", nodemailer.getTestMessageUrl(info));
  console.log("-----------------------------------------");
  
  return info;
}

module.exports = { sendOTP };

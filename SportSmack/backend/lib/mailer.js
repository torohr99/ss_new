const RESEND_API_KEY =
  process.env.RESEND_API_KEY;

const RESEND_FROM =
  process.env.RESEND_FROM ||
  'SportSmack <onboarding@resend.dev>';

if (!RESEND_API_KEY) {
  throw new Error(
    'RESEND_API_KEY is not configured'
  );
}

const sendMail = async ({
  to,
  subject,
  text,
  html
}) => {
  if (!to) {
    throw new Error(
      'Email recipient is required'
    );
  }

  const response = await fetch(
    'https://api.resend.com/emails',
    {
      method: 'POST',

      headers: {
        'Authorization':
          `Bearer ${RESEND_API_KEY}`,
        'Content-Type':
          'application/json'
      },

      body: JSON.stringify({
        from: RESEND_FROM,
        to: [to],
        subject,
        text,
        html
      })
    }
  );

  const data =
    await response.json();

  if (!response.ok) {
    const error =
      new Error(
        data?.message ||
        'Resend email request failed.'
      );

    error.status =
      response.status;

    error.resendData =
      data;

    throw error;
  }

  console.log(
    `Email sent successfully to ${to}. Resend ID: ${data?.id}`
  );

  return {
    messageId: data?.id,
    ...data
  };
};

module.exports = {
  sendMail
};

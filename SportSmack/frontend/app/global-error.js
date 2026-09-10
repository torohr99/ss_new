'use client';

export default function GlobalError({
  error,
  reset
}) {
  return (
    <html lang="en">
      <body>
        <main
          style={{
            minHeight: '100vh',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '24px',
            textAlign: 'center'
          }}
        >
          <div>
            <h1>
              Something went wrong
            </h1>

            <p>
              SportSmack encountered an
              unexpected error.
            </p>

            <button
              onClick={() => reset()}
              style={{
                marginTop: '16px',
                padding: '10px 18px',
                cursor: 'pointer'
              }}
            >
              Try again
            </button>
          </div>
        </main>
      </body>
    </html>
  );
}

'use client';

export default function GlobalError({ error, reset }) {
  return (
    <html>
      <body>
        <div style={{ padding: '2rem', textAlign: 'center' }}>
          <h2>Something went wrong!</h2>
          <p>{error.message}</p>
          <button onClick={() => reset()} style={{ padding: '0.5rem 1rem', background: '#3b82f6', color: 'white', border: 'none', borderRadius: '4px' }}>
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}

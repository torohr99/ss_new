export default function NotFound() {
  return (
    <main
      style={{
        minHeight: '70vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px',
        textAlign: 'center'
      }}
    >
      <div>
        <h1>404</h1>

        <h2>
          Page not found
        </h2>

        <p>
          The page you're looking for
          doesn't exist.
        </p>

        <a
          href="/"
          style={{
            display: 'inline-block',
            marginTop: '16px'
          }}
        >
          Return to SportSmack
        </a>
      </div>
    </main>
  );
}

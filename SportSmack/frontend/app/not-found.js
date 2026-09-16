import Link from 'next/link';

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
          The page you&apos;re looking for
          doesn&apos;t exist.
        </p>

        <Link
          href="/"
          style={{
            display: 'inline-block',
            marginTop: '16px'
          }}
        >
          Return to SportSmack
        </Link>
      </div>
    </main>
  );
}

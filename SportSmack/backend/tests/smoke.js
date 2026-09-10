const BACKEND_URL =
  process.env.BACKEND_URL ||
  'http://localhost:5000';

async function request(
  path,
  options = {}
) {
  const response = await fetch(
    `${BACKEND_URL}${path}`,
    options
  );

  let body = null;

  try {
    body = await response.json();
  } catch {
    body = null;
  }

  return {
    status: response.status,
    body
  };
}

async function runTest(
  name,
  test
) {
  try {
    await test();
    console.log(`✓ ${name}`);
  } catch (error) {
    console.error(`✗ ${name}`);
    console.error(error.message);
    process.exitCode = 1;
  }
}

async function main() {
  console.log(
    `Testing backend: ${BACKEND_URL}`
  );

  await runTest(
    'Backend health endpoint',
    async () => {
      const result =
        await request(
          '/api/status'
        );

      if (result.status !== 200) {
        throw new Error(
          `Expected 200, received ${result.status}`
        );
      }

      if (
        result.body?.status !==
        'OK'
      ) {
        throw new Error(
          'Health endpoint returned an unexpected response.'
        );
      }
    }
  );

  await runTest(
    'Health endpoint reports database availability',
    async () => {
      const result = await request('/api/status');
  
      if (result.status !== 200) {
        throw new Error(
          `Expected 200, received ${result.status}`
        );
      }
  
      if (result.body.status !== 'OK') {
        throw new Error(
          `Expected status OK, received ${result.body.status}`
        );
      }
  
      if (result.body.database !== 'OK') {
        throw new Error(
          `Expected database OK, received ${result.body.database}`
        );
      }
    }
  );

  await runTest(
    'Health endpoint is publicly available',
    async () => {
      const result =
        await request('/health');
  
      if (result.status !== 200) {
        throw new Error(
          `Expected 200, received ${result.status}`
        );
      }
  
      if (
        result.body?.status !==
        'OK'
      ) {
        throw new Error(
          'Health endpoint returned an unexpected response.'
        );
      }
    }
  );

  await runTest(
    'Unauthenticated admin metrics endpoint rejects request',
    async () => {
      const result = await request('/api/admin/metrics');
  
      if (result.status !== 401) {
        throw new Error(
          `Expected 401, received ${result.status}`
        );
      }
    }
  );
  
  await runTest(
    'Unknown endpoint returns 404',
    async () => {
      const result =
        await request(
          '/api/this-endpoint-does-not-exist'
        );

      if (result.status !== 404) {
        throw new Error(
          `Expected 404, received ${result.status}`
        );
      }
    }
  );

  await runTest(
    'Protected authentication endpoint rejects unauthenticated request',
    async () => {
      const result =
        await request(
          '/api/auth/me'
        );

      if (result.status !== 401) {
        throw new Error(
          `Expected 401, received ${result.status}`
        );
      }
    }
  );

  await runTest(
    'Protected posts endpoint rejects unauthenticated request',
    async () => {
      const result =
        await request(
          '/api/posts',
          {
            method: 'POST',
            headers: {
              'Content-Type':
                'application/json'
            },
            body: JSON.stringify({
              content:
                'Automated security test'
            })
          }
        );

      if (
        result.status !== 401
      ) {
        throw new Error(
          `Expected 401, received ${result.status}`
        );
      }
    }
  );

    await runTest(
      'Unauthenticated moderation endpoint rejects request',
      async () => {
        const result =
          await request(
            '/api/moderation/blocks'
          );
  
        if (result.status !== 401) {
          throw new Error(
            `Expected 401, received ${result.status}`
          );
        }
      }
    );
  
    await runTest(
      'Unauthenticated admin moderation endpoint rejects request',
      async () => {
        const result =
          await request(
            '/api/admin/moderation/reports'
          );
  
        if (result.status !== 401) {
          throw new Error(
            `Expected 401, received ${result.status}`
          );
        }
      }
    );
  
  console.log(
    '\nBackend smoke tests completed.'
  );

  if (process.exitCode === 1) {
    process.exit(1);
  }
}

main().catch(error => {
  console.error(
    '\nSmoke test runner failed:'
  );
  console.error(error);
  process.exit(1);
});

async function main() {
  const baseURL = process.env.API_URL || 'http://localhost:3000';
  const email = process.env.TEST_EMAIL || 'admin@local.com';
  const password = process.env.TEST_PASSWORD || '12345678';

  const authRes = await fetch(`${baseURL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!authRes.ok) {
    throw new Error(`Login failed with status ${authRes.status}`);
  }

  const authBody = await authRes.json();
  const token = authBody?.access_token;
  if (!token) {
    throw new Error('No token in login response');
  }

  const authorizedFetch = (path, init = {}) =>
    fetch(`${baseURL}${path}`, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        ...(init.headers || {}),
      },
    });

  const beforeRes = await authorizedFetch('/items/3');
  if (!beforeRes.ok) {
    throw new Error(`Failed to fetch item before update: ${beforeRes.status}`);
  }
  const before = await beforeRes.json();
  console.log('Antes:', before);

  const updateRes = await authorizedFetch('/items/3', {
    method: 'PUT',
    body: JSON.stringify({
      incomeAccountCode: '499999',
      expenseAccountCode: '599999',
      inventoryAccountCode: '199999',
      taxAccountCode: '299999',
    }),
  });
  if (!updateRes.ok) {
    const errorBody = await updateRes.text();
    throw new Error(`Update failed: ${updateRes.status} ${errorBody}`);
  }
  const updateJson = await updateRes.json();
  console.log('Update response:', updateJson);

  const afterRes = await authorizedFetch('/items/3');
  if (!afterRes.ok) {
    throw new Error(`Failed to fetch item after update: ${afterRes.status}`);
  }
  const after = await afterRes.json();
  console.log('Después:', after);
}

main().catch((err) => {
  console.error(err.response?.data || err.message || err);
  process.exit(1);
});

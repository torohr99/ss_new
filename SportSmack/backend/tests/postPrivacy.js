const test = require('node:test');
const assert = require('node:assert/strict');
const { canViewPost, POST_PRIVACY_VALUES } = require('../services/postPrivacy');

function makeClient({
  authorExists = true,
  privacy = 'FRIENDS_ONLY',
  blocked = false,
  friends = false
} = {}) {
  return {
    user: {
      async findUnique() {
        return authorExists
          ? { id: 20, postPrivacy: privacy }
          : null;
      }
    },
    block: {
      async findFirst() {
        return blocked ? { id: 1 } : null;
      }
    },
    friendship: {
      async findFirst() {
        return friends ? { id: 1 } : null;
      }
    }
  };
}

const post = { id: 100, user_id: 20 };

test('privacy values are restricted to the supported account settings', () => {
  assert.deepEqual(POST_PRIVACY_VALUES, ['FRIENDS_ONLY', 'PUBLIC']);
});

test('author can always view their own post', async () => {
  const client = makeClient();
  assert.equal(await canViewPost(20, post, client), true);
});

test('accepted friend can view a friends-only post', async () => {
  assert.equal(
    await canViewPost(10, post, makeClient({ friends: true })),
    true
  );
});

test('unrelated authenticated user cannot view a friends-only post', async () => {
  assert.equal(
    await canViewPost(10, post, makeClient()),
    false
  );
});

test('unrelated authenticated user can view a public post', async () => {
  assert.equal(
    await canViewPost(10, post, makeClient({ privacy: 'PUBLIC' })),
    true
  );
});

test('a block overrides public visibility and friendship', async () => {
  assert.equal(
    await canViewPost(
      10,
      post,
      makeClient({ privacy: 'PUBLIC', friends: true, blocked: true })
    ),
    false
  );
});

test('missing author cannot grant post visibility', async () => {
  assert.equal(
    await canViewPost(10, post, makeClient({ authorExists: false }))
    ,
    false
  );
});

test('invalid viewer or post identifiers are denied', async () => {
  const client = makeClient({ privacy: 'PUBLIC' });
  assert.equal(await canViewPost(0, post, client), false);
  assert.equal(await canViewPost(10, { user_id: 0 }, client), false);
  assert.equal(await canViewPost(10, null, client), false);
});

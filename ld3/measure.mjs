import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import {
  collection, deleteDoc, doc, getDocFromServer, getDocsFromServer, setDoc,
  Timestamp, updateDoc,
} from 'firebase/firestore';

const projectId = 'demo-musicreal-ld3';
const host = '127.0.0.1';
const port = 8093;
assert.equal(process.env.FIRESTORE_EMULATOR_HOST, `${host}:${port}`,
  'Launch via npm run measure so all requests use the local emulator.');

const rules = readFileSync(new URL('../firebase/firestore.rules', import.meta.url), 'utf8');
const env = await initializeTestEnvironment({ projectId, firestore: { host, port, rules } });
const fixtures = ['a', 'b'];
const user = (db, id) => doc(db, 'users', id);
const posts = (db, id) => collection(user(db, id), 'userPost');
const post = (db, id, key = 'post') => doc(posts(db, id), key);
const invite = (db, key) => doc(db, 'friend_requests', key);
const owner = (key) => `owner-${key}`;
const sender = (key) => `sender-${key}`;
const auth = (id) => env.authenticatedContext(id).firestore();
const stranger = auth('stranger');
const anonymous = env.unauthenticatedContext().firestore();
const rows = [];
const controls = [];

async function measure(id, scenario, fixture, operation, inspect) {
  let observed;
  let blocked;
  try {
    const value = await operation();
    blocked = false;
    observed = inspect ? inspect(value) : 'allowed';
  } catch (error) {
    if (error.code !== 'permission-denied') throw error;
    blocked = true;
    observed = 'permission-denied';
  }
  rows.push({ id, scenario, fixture, expected: 'permission-denied', observed, blocked });
  console.log(`${id} | ${scenario} | ${fixture} | ${observed} | ${blocked ? 'PASS' : 'GAP'}`);
}

async function control(name, run) {
  await run();
  controls.push(name);
  console.log(`CONTROL PASS | ${name}`);
}

try {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    for (const key of fixtures) {
      const id = owner(key);
      await setDoc(user(db, id), {
        uid: id, display_name: `Owner ${key}`, email: `${id}@example.test`, friends: [],
      });
      for (const record of ['post', 'delete', 'control-delete']) {
        await setDoc(post(db, id, record), {
          post_user: user(db, id), song_name: 'Fixture song', emoji: 'fixture-emotion',
          created_at: Timestamp.fromMillis(Date.UTC(2026, 9, 20, 12)),
        });
      }
      for (const suffix of ['unknown', 'number', 'control']) {
        await setDoc(invite(db, `${key}-${suffix}`), {
          sender: user(db, sender(key)), receiver: user(db, id), status: 'pending',
        });
      }
    }
  });

  for (const key of fixtures) {
    const id = owner(key);
    const asOwner = auth(id);
    const emailExposure = (snapshot) => {
      assert.equal(snapshot.get('email'), `${id}@example.test`);
      return 'allowed: email visible';
    };
    await control(`owner sees own email (${key})`, async () => {
      emailExposure(await getDocFromServer(user(asOwner, id)));
    });
    await control(`owner sees own posts (${key})`, async () => {
      assert.equal((await getDocsFromServer(posts(asOwner, id))).size, 3);
    });
    await measure('C1', 'anonymous profile read', key,
      () => getDocFromServer(user(anonymous, id)), emailExposure);
    await measure('C1', 'stranger profile read', key,
      () => getDocFromServer(user(stranger, id)), emailExposure);
    await measure('C2', 'stranger post get', key,
      () => getDocFromServer(post(stranger, id)), (snapshot) => {
        assert.equal(snapshot.get('emoji'), 'fixture-emotion');
        return 'allowed: emotion visible';
      });
    await measure('C2', 'stranger post list', key,
      () => getDocsFromServer(posts(stranger, id)), (snapshot) => {
        assert.equal(snapshot.size, 3);
        assert.ok(snapshot.docs.every((item) => item.get('emoji') === 'fixture-emotion'));
        return 'allowed: 3 posts visible';
      });
    await measure('I1', 'stranger post update', key,
      () => updateDoc(post(stranger, id), { emoji: 'changed' }));
    await measure('I1', 'stranger post delete', key,
      () => deleteDoc(post(stranger, id, 'delete')));
    await measure('I2', 'invalid status string', key,
      () => updateDoc(invite(asOwner, `${key}-unknown`), { status: 'unknown' }));
    await measure('I2', 'invalid status number', key,
      () => updateDoc(invite(asOwner, `${key}-number`), { status: 42 }));
    await control(`owner can edit and delete own posts (${key})`, async () => {
      const record = post(asOwner, id);
      const deletable = post(asOwner, id, 'control-delete');
      await updateDoc(record, { emoji: 'owner-update' });
      assert.equal((await getDocFromServer(record)).get('emoji'), 'owner-update');
      await deleteDoc(deletable);
      assert.equal((await getDocFromServer(deletable)).exists(), false);
    });
    await control(`receiver can accept a pending invite (${key})`, async () => {
      const record = invite(asOwner, `${key}-control`);
      await updateDoc(record, { status: 'accepted' });
      assert.equal((await getDocFromServer(record)).get('status'), 'accepted');
    });
  }

  const scores = Object.entries(Object.groupBy(rows, (row) => `${row.id}|${row.scenario}`))
    .map(([group, entries]) => {
      const [id, scenario] = group.split('|');
      const blocked = entries.filter((row) => row.blocked).length;
      return { id, scenario, blocked, total: entries.length, percent: 100 * blocked / entries.length };
    });
  const result = {
    projectId,
    commit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
    rulesLastChangedCommit: execFileSync('git', ['log', '-1', '--format=%H', '--', '../firebase/firestore.rules'],
      { encoding: 'utf8' }).trim(),
    rulesSha256: createHash('sha256').update(rules).digest('hex'),
    rulesSha256Lf: createHash('sha256').update(rules.replace(/\r\n/g, '\n')).digest('hex'),
    node: process.version,
    runAt: new Date().toISOString(),
    controls,
    scores,
    rows,
  };
  console.table(scores);
  writeFileSync(new URL('./results.json', import.meta.url), JSON.stringify(result, null, 2) + '\n');
} finally {
  await env.cleanup();
}

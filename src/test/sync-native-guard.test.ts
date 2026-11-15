/** 2026-11-15 crash: Margin died with WebsocketNotConnectedException. `startLoopback`'s onOpen handed the challenge
 *  to the sync executor; by the time it ran, phone Obsidian had closed the socket, `conn.send` threw, and an
 *  exception on any Android thread kills the app. Kotlin is compiled only in CI, so this guards the source:
 *  every task on the sync executor is caught, and no socket send happens outside the one guarded helper. */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const kt = readFileSync(join(__dirname, '..', '..', 'modules', 'margin-native', 'android', 'src', 'main', 'java', 'app', 'marginalia', 'nativebits', 'SyncEngine.kt'), 'utf8');

it('every task on the sync executor runs inside a catch-all', () => {
  const def = /val exec: java\.util\.concurrent\.Executor = [\s\S]*?\n {2}\}/.exec(kt)?.[0] ?? '';
  expect(def).toMatch(/catch \(t: Throwable\)/);
  expect(def).toMatch(/RejectedExecutionException/);
});

it('a Java-WebSocket send goes through sendSafe, which checks isOpen and catches', () => {
  const helper = /private fun sendSafe\(conn: JWebSocket, text: String\): Boolean \{[\s\S]*?\n {2}\}/.exec(kt)?.[0] ?? '';
  expect(helper).toMatch(/conn\.isOpen/);
  expect(helper).toMatch(/catch \(e: Exception\)/);
  const raw = kt.replace(helper, '').match(/\bconn\.send\(/g) ?? [];
  expect(raw).toHaveLength(0);
});

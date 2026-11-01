/* Every suite runs in a timezone with daylight saving (Europe/Berlin falls back on 25 Oct 2026), so a
   `t0 + n * DAY_MS` that should have been a calendar day fails here instead of on a phone in October.
   Set in globalSetup because a worker reads TZ when it starts; setting it inside a test file is too late. */
module.exports = async () => { process.env.TZ = 'Europe/Berlin'; };

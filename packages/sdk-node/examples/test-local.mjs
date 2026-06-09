// Local SDK smoke test — sends events through the built Node SDK to the
// running ingestion API, end-to-end (ingestion → Kafka → worker → ClickHouse).
//
// Usage:
//   API_KEY=amp_xxx node examples/test-local.mjs
//
import Analytics from '../dist/index.mjs'

const apiKey = process.env.API_KEY
if (!apiKey) {
  console.error('Set API_KEY env var (get one from signup or the Settings page)')
  process.exit(1)
}

Analytics.init({
  apiKey,
  serverUrl: 'http://localhost:4000',
  flushIntervalMs: 1000,
})

console.log('Sending test events…')

Analytics.identify('user_local_test', { name: 'Local Tester', plan: 'pro' })
Analytics.track('App Started',   { source: 'sdk-local-test' }, { userId: 'user_local_test' })
Analytics.track('Page Viewed',   { path: '/home' },            { userId: 'user_local_test' })
Analytics.track('Button Clicked',{ button: 'signup' },         { userId: 'user_local_test' })

await Analytics.shutdown() // flushes the queue before exit
console.log('✓ Events flushed. Check ClickHouse in ~2s.')

// minimal env setup for e2e tests
process.env.WATCHER_API_BASE = process.env.WATCHER_API_BASE || "http://localhost:54001/api"
process.env.WATCHER_AUTHORITY = process.env.WATCHER_AUTHORITY || "http://localhost:8080"
process.env.WATCHER_CLIENT_ID = process.env.WATCHER_CLIENT_ID || "stigman-watcher"
process.env.WATCHER_COLLECTION = process.env.WATCHER_COLLECTION || "1"

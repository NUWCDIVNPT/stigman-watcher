module.exports = {
  addExisting: process.env.STIGMAN_WATCHER_ADD_EXISTING !== undefined ? process.env.STIGMAN_WATCHER_ADD_EXISTING === 'true' : false,
  collectionId: process.env.STIGMAN_WATCHER_COLLECTION || "124",
  authority: process.env.STIGMAN_WATCHER_AUTHORITY || "http://localhost:8080/auth/realms/stigman",
  clientId:  process.env.STIGMAN_WATCHER_CLIENTID || "stigman-watcher",
  secret:  process.env.STIGMAN_WATCHER_SECRET || '954fd71a-dad6-47ab-8035-060268f3d396',
  watchDir: process.env.STIGMAN_WATCHER_DIR || "./watched",
  apiBase: process.env.STIGMAN_WATCHER_APIBASE || "http://localhost:64001/api",
  createApiObjects: process.env.STIGMAN_WATCHER_CREATE_OBJECTS !== undefined ? process.env.STIGMAN_WATCHER_CREATE_OBJECTS === 'true' : true
}
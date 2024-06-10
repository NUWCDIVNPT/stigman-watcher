export const ERR_APIOFFLINE = 1
export const ERR_AUTHOFFLINE = 2
export const ERR_NOTOKEN = 3
export const ERR_NOGRANT = 4
export const ERR_UNKNOWN = 5
export const ERR_FAILINIT = 6


// Minimum and maximum values for Watcher configuration
const WATCHER_SCAN_INTERVAL_MIN = 60000 // 60 seconds - Should be greater than WATCHER_CARGO_DELAY
const WATCHER_SCAN_INTERVAL_MAX = 24 * 60 * 60000 // 24 hours

const WATCHER_CARGO_SIZE_MIN = 1
const WATCHER_CARGO_SIZE_MAX = 100
const WATCHER_CARGO_DELAY_MIN = 2000 // 2 seconds
const WATCHER_CARGO_DELAY_MAX = 30000 // 30 seconds

const WATCHER_HISTORY_WRITE_INTERVAL_MIN = 10000 // 10 seconds
const WATCHER_HISTORY_WRITE_INTERVAL_MAX = 60000 // 60 seconds

const WATCHER_RESPONSE_TIMEOUT_MIN = 5000 // 5 seconds
const WATCHER_RESPONSE_TIMEOUT_MAX = 60000 // 60 seconds

const WATCHER_STABILITY_THRESHOLD_MAX = 10000 // 10 seconds


export const configBounds = {
  scanInterval: {
    min: WATCHER_SCAN_INTERVAL_MIN,
    max: WATCHER_SCAN_INTERVAL_MAX
  },
  cargoDelay: {
    min: WATCHER_CARGO_DELAY_MIN,
    max: WATCHER_CARGO_DELAY_MAX
  },
  cargoSize: {
    min: WATCHER_CARGO_SIZE_MIN,
    max: WATCHER_CARGO_SIZE_MAX
  },
  historyWriteInterval: {
    min: WATCHER_HISTORY_WRITE_INTERVAL_MIN,
    max: WATCHER_HISTORY_WRITE_INTERVAL_MAX
  },
  responseTimeout: {
    min: WATCHER_RESPONSE_TIMEOUT_MIN,
    max: WATCHER_RESPONSE_TIMEOUT_MAX
  },  
  stabilityThreshold: {
    min: 0,
    max: WATCHER_STABILITY_THRESHOLD_MAX
  },  
}




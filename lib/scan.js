import { logger } from './logger.js'
import { queue } from './parse.js'
import { serializeError } from 'serialize-error'
import fg from 'fast-glob'
import lineByLine from 'n-readlines'
import fs from 'node:fs'

const component = 'scan'
let history = new Set() // in memory history set
let historyFilePath = null // path to history file
let isWriteScheduled = false // flag to indicate if there is pending files to write to the history file

/**
 * Starts the scanner file scanner and manages the history of scanned files.
 * 
 * @param {Object} options - Stigman Watcher configuration options .
 * @param {string} options.path - The path to scan for files.
 * @param {boolean} [options.ignoreDot=false] - Whether to ignore dot files in the path.
 * @param {string[]} [options.ignoreGlob=[]] - The globs to ignore.
 * @param {boolean} [options.oneShot=false] - Whether to perform a one-shot scan or schedule periodic scans.
 * 
 */
async function startScanner(options) { 
  const discoveredFiles = new Set() // in memory set of files discovered in the current scan
  try {
    // scan the path for files
      const stream = fg.stream([`${options.path}/**/*.ckl`, `${options.path}/**/*.xml`, `${options.path}/**/*.cklb`], {
          dot: !options.ignoreDot,
          suppressErrors: true,
          ignore: options.ignoreGlob ?? []
      })
      logger.info({ component: component, message: `scan started`, path: options.path })
      // for each file discovered
      for await (const entry of stream) {
        discoveredFiles.add(entry)
          logger.verbose({ component: component, message: `discovered file`, file: entry })
          // check if the file is in the history
          if (history.has(entry)) {
            logger.verbose({component: component, message: `history match`, file: entry})
          }
          // if the file is not in the history, add it to the in memory history set.
          else {
            addToHistory(entry)
            queue.push(entry)
            logger.info({component: component, message: `queued for parsing`, file: entry})
          }
      }
      //Identify stale files: those in the history but not in the current scan
      removeStaleFiles(discoveredFiles)
      logger.info({ component: component, message: `scan ended`, path: options.path })
  } catch (e) {
      logger.error({ component: component, error: serializeError(e) })
  } finally {
      if (!options.oneShot) {
          scheduleNextScan(options)
      } else {
          logger.info({ component: component, message: `one-shot scan completed`, path: options.path })
      }
  }
}
/**
 * Processes the file intersection between the current files set and the history.
 * Removes stale files from in memory history.
 * 
 * @param {Set<string>} currentFilesSet - The set of current files.
 */
function removeStaleFiles(currentFilesSet){
  const staleFiles = Array.from(history).filter(file => !currentFilesSet.has(file))
  if (staleFiles.length > 0) {
    removeFromHistory(staleFiles)
  }
}

/**
 * Schedule the next scan.
 * @param {object} options - The watcher startup config options.
 * @param {number} options.path - The path to scan.
 * @param {string} options.scanInterval - The timeout to invoke startScanner().
 */
function scheduleNextScan(options) {
  setTimeout(() => {
    startScanner(options).catch(e => {
      logger.error({ component: component, error: serializeError(e) })
    })
  }, options.scanInterval)

  logger.info({ 
    component: component, 
    message: `scan scheduled`, 
    path: options.path,
    delay: options.scanInterval 
  })
}


/**
 * Initializes the history in memory by reading it from a file and adding each line to the history set.
 * Also Initalizes a write interval for the history file.
 * @param {object} options - The watcher startup config options.
 * @param {string} options.historyFile - The path to the history file.
 * @param {string} options.historyWriteInterval - The interval to invoke witeHistoryToFile().
 */
function initHistory(options) {
  
  // no history file, no need to initialize
  if (!options.historyFile) return

  historyFilePath = options.historyFile

  // ensure we have a history file and read it into memory
  if (historyFilePath && fs.existsSync(historyFilePath)) {
    const liner = new lineByLine(historyFilePath)
    let line
    while (line = liner.next()) {
      // add each line to the history set
      history.add(line.toString('ascii'))
    }
    logger.verbose({
      component: component,
      message: `history initialized from file`,
      file:historyFilePath,

    })
  }
   setInterval(() => {
    if (!isWriteScheduled) return
    writeHistoryToFile()
    isWriteScheduled = false
  }, options.historyWriteInterval)

}

/**
 * Removes files from the history set and schedules a write to the history file.
 * @param {string|string[]} files - The file(s) to be removed.
 */
function removeFromHistory (files) {
  // process array of files
  if (Array.isArray(files)) {
    for (const entry of files) {
      history.delete(entry)
    }
  }
  // process single file
  else {
    history.delete(files)
  }

  isWriteScheduled = true // Indicate that there's work to be done
  logger.verbose({
    component: component,
    message: `removed from history`,
    file: files
  })
}


/**
 * Adds files to the history set and schedules a write to the history file.
 * @param {Array|string} files - The file(s) to be added.
 */
function addToHistory (files) {
  // process array of files
  if (Array.isArray(files)) {
    for (const entry of files) {
      history.add(entry)
    }
  } else {
    // single item
    history.add(files)
  }

  isWriteScheduled = true
  logger.verbose({
    component: component,
    message: `added to history`,
    file: files
  })
}

/**
 * Sets the history with a new set of values. Primarily used for testing.
 * @param {Set} newSet - The new set of values to be assigned to the history.
 */
function setHistory(newSet){
  history = newSet
}

/**
 * Saves the current history set in memory to a history file.
 */
function writeHistoryToFile() {
  try {
    const data = Array.from(history).join('\n') + '\n'
    fs.writeFileSync(historyFilePath, data) 
    logger.verbose({
      component:component,
      message: `history file overwritten with new data from memory`,
      file: historyFilePath
    })
  } catch (e) {
    logger.error({
      component: component,
      error: serializeError(e)
    })
  }
}

// Handle shutdown
process.on('SIGINT', async () => {
  logger.info({
    component: component,
    message: `received SIGINT`
  })
  // write history to file before exiting if we are using a history file
  if(historyFilePath)writeHistoryToFile()
  process.exit(0)
})

export {
  startScanner,
  initHistory,
  addToHistory,
  setHistory,
  removeFromHistory
 }

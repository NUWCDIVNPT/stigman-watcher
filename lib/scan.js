import { logger } from './logger.js'
import { options } from './args.js'
import { queue as parseQueue} from './parse.js'
import { serializeError } from 'serialize-error'
import fg from 'fast-glob'
import lineByLine from 'n-readlines'
import fs from 'node:fs'

const component = 'scan'
const historySet = new Set() // in memory history set
let isWriteScheduled = false // flag to indicate if there is pending files to write to the history file

/**
 * Utility function that calls initHistory() and startScanner()
 */
function initScanner() {
  initHistory()
  startScanner()
}

/**
 * Starts a fast-glob stream and manages the history of scanned files.
 * References options properties {path, ignoreDot, ignoreGlob, oneShot}.
 */
async function startScanner() { 
  const discoveredFiles = new Set() // in memory set of files discovered in the current scan
  try {
    // scan the path for files
      const stream = fg.stream([`${options.path}/**/*.ckl`, `${options.path}/**/*.xml`, `${options.path}/**/*.cklb`], {
          dot: !options.ignoreDot,
          suppressErrors: true,
          ignore: options.ignoreGlob ?? []
      })
      logger.info({ component, message: `scan started`, path: options.path })
      // for each file discovered
      for await (const entry of stream) {
        discoveredFiles.add(entry)
        logger.verbose({ component, message: `discovered file`, file: entry })
        // check if the file is in the history
        if (historySet.has(entry)) {
          logger.verbose({component, message: `history match`, file: entry})
        }
        // if the file is not in the history, add it to the in memory history set.
        else {
          addToHistory(entry)
          parseQueue.push(entry)
          logger.info({component, message: `queued for parsing`, file: entry})
        }
      }
      //Remove stale files: those in historySet but not found in the current scan
      removeStaleFiles(discoveredFiles)
      logger.info({ component, message: `scan ended`, path: options.path })
  } 
  catch (e) {
      logger.error({ component, error: serializeError(e) })
  } 
  finally {
    if (!options.oneShot) {
        scheduleNextScan()
    } 
    else {
        logger.info({ component, message: `one-shot scan completed`, path: options.path })
    }
  }
}

/**
 * Deletes entries from historySet that are not present in currentFilesSet.
 * @param {Set<string>} currentFilesSet - The set of current files.
 */
function removeStaleFiles(currentFilesSet){
  const staleFiles = Array.from(historySet).filter(file => !currentFilesSet.has(file))
  if (staleFiles.length > 0) {
    removeFromHistory(staleFiles)
  }
}

/**
 * Schedules the next scan at options.scanInterval milliseconds from now.
 * References options properties {path, scanInterval}.
 */
function scheduleNextScan() {
  setTimeout(() => {
    startScanner().catch(e => {
      logger.error({ component, error: serializeError(e) })
    })
  }, options.scanInterval)

  logger.info({ 
    component, 
    message: `scan scheduled`, 
    path: options.path,
    delay: options.scanInterval 
  })
}

/**
 * Returns immediately if options.historyFile is falsy.
 * Initializes the history Set by reading it from a file and adding each line to the history set.
 * Creates history file if necessary and if successful sets up SIGINT handler and initializes a write interval.
 * References options properties {historyFile, historyWriteInterval}
 */
function initHistory() {
  historySet.clear()

  // Log history set values on SIGUSR2
  process.on('SIGUSR2', logHistory)

  // no history file specified, no need to setup
  if (!options.historyFile) return

  if (isHistoryFileReadable()) {
    // initialize history set with content of history file
    const liner = new lineByLine(options.historyFile)
    let line
    while (line = liner.next()) {
      // add each line to the history set
      historySet.add(line.toString('ascii'))
    }
    logger.verbose({
      component,
      message: `history initialized from file`,
      file:options.historyFile,
    })
  }
  else {
    logger.warn({
      component,
      message: 'history file is not readable, scan history is uninitialized',
      file: options.historyFile
    })
  }

  if (isHistoryFileWriteable()) {
    // Handle the interrupt signal
    process.prependListener('SIGINT', interruptHandler)
    // Set the write interval handler
    setInterval(writeIntervalHandler, options.historyWriteInterval)
    logger.verbose({
      component,
      message: `history file is writable, periodic writes enabled`,
      file:options.historyFile,
      writeInterval: options.historyWriteInterval
    })
  }
  else {
    logger.warn({
      component,
      message: 'history file is not writable, scan history will not be flushed',
      file: options.historyFile
    })
  }
}

/**
 * Writes historySet to options.historyFile before exiting.
 * Intended to be a callback function for the SIGINT signal
 */
function interruptHandler() {
  logger.info({
    component,
    message: `received SIGINT, try writing history to file`
  })
  writeHistoryToFile()
}

/**
 * If isWriteScheduled is true, writes historySet to file and sets isWriteScheduled to false
 * Intended to be a callback function of setInterval()
 */
function writeIntervalHandler() {
  if (!isWriteScheduled) return
  writeHistoryToFile()
  isWriteScheduled = false
}

/**
 * Logs an info message with the historySet entries.
 * Intended to be a callback function for the SIGUSER2 signal
 */
function logHistory() {
  logger.info({
    component,
    message: `received SIGUSR2, dumping historySet entries`,
    history: Array.from(historySet)
  })
}

/**
 * Removes files from the history set and schedules a write to the history file.
 * @param {string|string[]} files - The file(s) to be removed.
 */
function removeFromHistory (files) {
  // process array of files
  if (Array.isArray(files)) {
    for (const entry of files) {
      historySet.delete(entry)
    }
  }
  // process single file
  else {
    historySet.delete(files)
  }

  isWriteScheduled = true // Indicate that there's work to be done
  logger.verbose({
    component,
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
      historySet.add(entry)
    }
  } else {
    // single item
    historySet.add(files)
  }

  isWriteScheduled = true
  logger.verbose({
    component,
    message: `added to history`,
    file: files
  })
}

/**
 * Saves the historySet entries to a history file.
 */
function writeHistoryToFile() {
  try {
    if (isHistoryFileWriteable()) {
      const data = Array.from(historySet).join('\n') + '\n'
      fs.writeFileSync(options.historyFile, data) 
      logger.verbose({
        component:component,
        message: `history file overwritten with history data from memory`,
        file: options.historyFile
      })
    }
    else {
      logger.warn({
        component,
        message: 'history file is not writable, scan history will not be flushed',
        file: options.historyFile
      })
    }
  }
  catch (e) {
    logger.error({
      component,
      message: 'failure writing to history file',
      error: serializeError(e)
    })
  }
}

/**
 * Test if options.historyFile is readable.
 * @returns {boolean}
 */
function isHistoryFileReadable() {
  try {
    fs.accessSync(options.historyFile, fs.constants.R_OK)
    return true
  }
  catch {
    return false
  }
}

/**
 * Test if options.historyFile is writable.
 * If options.historyFile does not exist, create it.
 * @returns {boolean}
 */
function isHistoryFileWriteable() {
  try {
    if (fs.existsSync(options.historyFile)) {
      fs.accessSync(options.historyFile, fs.constants.W_OK)
    }
    else {
      fs.closeSync(fs.openSync(options.historyFile, 'w'))
     }
     return true
  }
  catch {
    return false
  }
}

export { 
  startScanner,
  initHistory,
  initScanner, 
  addToHistory, 
  removeFromHistory,
}

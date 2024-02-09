import { logger } from './logger.js'
import { queue } from './parse.js'
import { serializeError } from 'serialize-error'
import fg from 'fast-glob'
import Queue from 'better-queue';
import lineByLine from 'n-readlines';
import fs from 'node:fs';

const component = 'scan'
let history = new Set(); // in memory history set
const pendingRemovals = new Set(); // in memory set of entries to be removed from history file
let historyFilePath = null; // path to history file
const historyBatchDelayTimeout = 30000; // 30 sec
let writeQueue; // queue 


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
export default async function startScanner(options) { 
  let currentFilesSet = new Set(); // in memory set of files discovered in the current scan
  try {
    // scan the path for files
      const stream = fg.stream([`${options.path}/**/*.ckl`, `${options.path}/**/*.xml`, `${options.path}/**/*.cklb`], {
          dot: !options.ignoreDot,
          suppressErrors: true,
          ignore: options.ignoreGlob ?? []
      });

      logger.info({ component: component, message: `scan started`, path: options.path });

      // for each file discovered
      for await (const entry of stream) {
          currentFilesSet.add(entry);
          logger.verbose({ component: component, message: `discovered file`, file: entry });
          // check if the file is in the history
          if (getHistory().has(entry)) {
            logger.verbose({component: component, message: `history match`, file: entry})
          }
          // if the file is not in the history, add it to the parse queue and the history set
          else {
            // remove this add when resolving issue #62!!!
            addToHistory(entry);
            queue.push(entry)
            logger.info({component: component, message: `queued for parsing`, file: entry})
          }
      }

      //Identify stale files: those in the history but not in the current scan
      processFileIntersect(currentFilesSet);
    
      logger.info({ component: component, message: `scan ended`, path: options.path });
  } catch (e) {
      logger.error({ component: component, error: serializeError(e) });
  } finally {
      if (!options.oneShot) {
          scheduleNextScan(options);
      } else {
          logger.info({ component: component, message: `one-shot scan completed`, path: options.path });
      }
  }
}
/**
 * Processes the file intersection between the current files set and the history.
 * Removes stale files from the history.
 * 
 * @param {Set} currentFilesSet - The set of current files.
 */
function processFileIntersect(currentFilesSet){
  for (const file of getHistory()) {
    if (!currentFilesSet.has(file)) {
      // Remove stale files from history
      removeFromHistory(file);
    }
  }
}

// Schedule the next scan
function scheduleNextScan(options) {
  setTimeout(() => {
    startScanner(options).catch(e => {
      logger.error({ component: component, error: serializeError(e) });
    });
  }, options.scanInterval);

  logger.info({ 
    component: component, 
    message: `scan scheduled`, 
    path: options.path,
    delay: options.scanInterval 
  });
}


/**
 * Initializes the history by reading it from a file and adding each line to the history set.
 * Also Initalizes a write queue if needed to manage the history file.
 * @param {object} options - The watcher startup config options.
 * @param {string} options.historyFile - The path to the history file.
 */
function initHistory(options) {
  // no history file, no need to initialize
  if (!options.historyFile) return;

  historyFilePath = options.historyFile;

  // create a queue if we need it
  initWriteQueue(options);

  // ensure we have a history file and read it into memory
  if (historyFilePath && fs.existsSync(historyFilePath)) {
    const liner = new lineByLine(historyFilePath);
    let line;

    while (line = liner.next()) {
      // add each line to the history set
      history.add(line.toString('ascii'));
    }
    logger.verbose({
      component: component,
      message: `history initialized from file`,
      file:historyFilePath,

    });
  }
}

/**
 * Initializes the write queue for history file management.
 * 
 * @param {object} options - The options for the write queue.
 * @param {number} options.historyCargoSize - The size of each batch in the write queue.
 * @param {number} options.historyCargoDelay - The delay between each batch in the write queue.
 */
function initWriteQueue(options) {

  // queue for history file management
  writeQueue = new Queue((batch, done) => {

  // flag to indicate if we have pending entries to remove from the history file
  let shouldRemoveEntries = false;

  // process each task in the batch
  for (const task of batch) {
    if (task.operation === 'add') {
      // Append 'add' operations to the history file
      appendToHistoryFile(task.entry);
    } else if (task.operation === 'remove') {
      // Add 'remove' operations to the pendingRemovals set
      pendingRemovals.add(task.entry);
      shouldRemoveEntries = true;
    }
  }

  // if we have pending removals, remove them`
  if (shouldRemoveEntries) {
    removeFromHistoryFile();
  }
  done();
},{
  batchSize: 4,
  batchDelay: 20000,
  batchDelayTimeout: historyBatchDelayTimeout, 
 });

}


/**
 * Appends a single entry to the history file.
 * @param {string} entry - The entry to be appended.
 */
 function appendToHistoryFile(entry) {
  // apending a single entry to the history file
  fs.appendFile(historyFilePath, entry + '\n', (err) => {
      if (err) {
          logger.error({
              component: component,
              error: serializeError(err),
              message: 'Failed to append to history file'
          });
      } else {
          logger.info({
              component: component,
              message: `wrote entry to history file`,
              file: entry
          });
      }
  });
}


/**
 * Removes entries from the history file. 
 * Will rewrite the history file with the pending entries removed.
 */
function removeFromHistoryFile() {
  // read the history file into memory
  const fileContent = fs.readFileSync(historyFilePath, 'utf-8');
  const lines = fileContent.split('\n');
  // filter out the entries to be removed
  const newContent = lines.filter(line => !pendingRemovals.has(line)).join('\n');
  // rewrite
  fs.writeFileSync(historyFilePath, newContent);
  logger.info({
      component: component,
      message: `removed entries from history file`,
      file: Array.from(pendingRemovals)
  });
  // clear the pending removals set
  pendingRemovals.clear();
}


function getHistory() {
  return new Set(history); // Return a copy to prevent direct manipulation
}


// set the history set
function setHistory(historySet) {
  history = historySet;
}



/**
 * Removes files from the history set and if needed pushes tasks to the write queue.
 * @param {string|string[]} files - The file(s) to be removed.
 */
function removeFromHistory(files) {

  // process array of files
  if (Array.isArray(files)) {
      for (const entry of files) {
        history.delete(entry);
        // only push to the write queue if we have a history file
        if(historyFilePath) writeQueue.push({ operation: 'remove', entry: entry });
        logger.info({
          component: component,
          message: `removed from history`,
          file: entry
        });
      }
  } 
  // process single file
  else {
      history.delete(files);
      // only push to the write queue if we have a history file
      if(historyFilePath) writeQueue.push({ operation: 'remove', entry: files });
      logger.info({
        component: component,
        message: `removed from history`,
        file: files
      });
  }

}

/**
 * Adds files to the history set and if needed pushes tasks to the write queue.
 * @param {Array|string} files - TThe file(s) to be added.
 */
function addToHistory(files) {

   // process array of files
  if (Array.isArray(files)) {
      for (const entry of files) {
          history.add(entry);
          if(historyFilePath) writeQueue.push({ operation: 'add', entry: entry });
          logger.info({
              component: component,
              message: `added to history`,
              file: entry
          });
      };
  }
  else {
      // single item 
      history.add(files);
      if(historyFilePath) writeQueue.push({ operation: 'add', entry: files });
      logger.info({
          component: component,
          message: `added to history`,
          file: files
      });
  }
}


/**
 * Saves the current history to a file. (used for process exit)
 */
function saveCurrentHistoryToFile() {
  try {
    const data = Array.from(history).join('\n') + '\n';
    fs.writeFileSync(historyFilePath, data); 
    logger.info({
      component:component,
      message: `history file overwritten with new data from memory`,
      file: historyFilePath
    });
  } catch (e) {
    logger.error({
      component: component,
      error: serializeError(e)
    });
  }
}

// Flush the write queue
function flushWriteQueue() {
  return new Promise((resolve, reject) => {
    writeQueue.on('drain', resolve); // Resolve when the queue is drained
  });
}

// Handle shutdown
process.on('SIGINT', async () => {

  // if we don't have a history file, just exit
  if(!historyFilePath) process.exit(0);
  
  logger.info({
    component: component,
    message: `received SIGINT. Having history and exiting`
  });
  // Flush the write queue
  flushWriteQueue();
  saveCurrentHistoryToFile();
  process.exit(0);
});

export { scheduleNextScan,
  initHistory, 
  getHistory,
  addToHistory,
  removeFromHistory,
  setHistory,
  saveCurrentHistoryToFile,
  flushWriteQueue
 }

import fs from 'node:fs';
import { serializeError } from 'serialize-error';
import { logger } from './logger.js';
import lineByLine from 'n-readlines';
import Queue from 'better-queue';

let history = new Set(); // in memory history set
const pendingRemovals = new Set(); // in memory set of entries to be removed from history file
let historyFilePath = ''; // path to history file
const component = "historyManager";

 // queue for history file management
 let writeQueue = new Queue((batch, done) => {

  let shouldRemoveEntries = false;
  
  batch.forEach(task => {
    if (task.operation === 'add') {
        // Append 'add' operations to the history file
        appendToHistoryFile(task.entry);
    } else if (task.operation === 'remove') {
        // Add 'remove' operations to the pendingRemovals set
        pendingRemovals.add(task.entry);
        shouldRemoveEntries = true;
    }
}); 
  // if we have pending removals, remove them
  if (shouldRemoveEntries) {
      removeFromHistoryFile();
  }
  done();
},{
  batchSize: 5,
  batchDelay: 10000,
  batchDelayTimeout: 60000, 
});

// inital load of history contents from file
function loadHistoryFromFile(historyPath) {
  historyFilePath = historyPath;
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

 // Function to append an entry to the history file
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

// Function to remove entries from the history file
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

// add an entry to the history set and queue it for writing to the history file
function addToHistory(files) {

  if (Array.isArray(files)) {
      // array of items 
      files.forEach(entry => {
          history.add(entry);
          writeQueue.push({ operation: 'add', entry: entry });
          logger.info({
              component: component,
              message: `added to history`,
              file: entry
          });
      });
  } else {
      // single item 
      history.add(files);
      writeQueue.push({ operation: 'add', entry: files });
      logger.info({
          component: component,
          message: `added to history`,
          file: files
      });
  }
}


// remove an entry from the history set and queue it for writing to the history file
function removeFromHistory(entry) {
  history.delete(entry);
  writeQueue.push({ operation: 'remove', entry: entry });
  logger.info({
    component: component,
    message: `removed from history`,
    file: entry
  });
}

// set the history set
function setHistory(historySet) {
  history = historySet;
}

// save the current state of the history set to the history file 
function saveCurrentHistoryToFile() {
  try {
    const data = Array.from(history).join('\n') + '\n';
    fs.writeFileSync(historyFilePath, data); 
    logger.info({
      component:component,
      message: `history file overwritten with new data`,
      file: historyFilePath
    });
  } catch (e) {
    logger.error({
      component: component,
      error: serializeError(e)
    });
  }
}

function flushWriteQueue() {
  return new Promise((resolve, reject) => {
      if (writeQueue.length() === 0) {
          resolve(); // Resolve immediately if the queue is empty
      } else {
          writeQueue.on('drain', resolve); // Resolve when the queue is drained
      }
  });
}

// Handle shutdown
process.on('SIGINT', async () => {

  logger.info({
    component: component,
    message: `received SIGINT. Having history and exiting`
  });
  // Flush the write queue
  flushWriteQueue();
  saveCurrentHistoryToFile();
  // Now it's safe to exit
  process.exit(0);
});

export {
  loadHistoryFromFile,
  getHistory,
  addToHistory,
  removeFromHistory,
  setHistory,
  saveCurrentHistoryToFile
};
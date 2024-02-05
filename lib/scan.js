import { logger } from './logger.js'
import { queue } from './parse.js'
import { serializeError } from 'serialize-error'
import * as historyManager from './historyManager.js'
import fg from 'fast-glob'

const component = 'scan'

function setUpHistory(options) {
  if (options.historyFile) historyManager.loadHistoryFromFile(options.historyFile);
}

export default async function startScanner(options) {
  let currentFilesSet = new Set();
  try {
      const stream = fg.stream([`${options.path}/**/*.ckl`, `${options.path}/**/*.xml`, `${options.path}/**/*.cklb`], {
          dot: !options.ignoreDot,
          suppressErrors: true,
          ignore: options.ignoreGlob ?? []
      });

      logger.info({ component: component, message: `scan started`, path: options.path });

      for await (const entry of stream) {
          currentFilesSet.add(entry);
          logger.verbose({ component: component, message: `discovered file`, file: entry });
          if (historyManager.getHistory().has(entry)) {
            logger.verbose({component: component, message: `history match`, file: entry})
          }
          else {
            // remove this add when resolving issue #62
            historyManager.addToHistory(entry);
            queue.push(entry)
            logger.info({component: component, message: `queued for parsing`, file: entry})
          }
      }

        // Identify stale files: those in the history but not in the current scan
      for (const file of historyManager.getHistory()) {
        if (!currentFilesSet.has(file)) {
          // Remove stale files from history
          historyManager.removeFromHistory(file);
        }
      }
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

export { scheduleNextScan, setUpHistory }

const chalk = require('chalk')

const log = function ( level, logObj ) {
  const chalkFn = level === 'success' ? chalk.green : level === 'error' ? chalk.red.bold : chalk.white
  const consoleFn = level === 'error' ? console.error : console.log
  const time = new Date().toISOString()
  const outObj = { time, level, ...logObj }
  consoleFn(chalkFn(JSON.stringify(outObj))) 
}

module.exports = log
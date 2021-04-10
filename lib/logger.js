const chalk = require('chalk')
const { createLogger, format, transports } = require('winston')

class JsonFieldOrder {
  constructor(enabled = true) {
      this.enabled = enabled
  }
  transform(obj) {
      if (this.enabled) {
          return {
            timestamp: obj.timestamp,
            level: obj.level,
            component: obj.component,
            message: obj.message,
            ...obj
          }
      }
      return obj
  }
}

const colorFormat = format.colorize({ all: true, colors: {
  info: 'white'
} })

const logger = createLogger({
  level: 'error',
  format: format.combine(
    format.timestamp(),
    new JsonFieldOrder(),
    format.json()
  ),
  transports: [
    new transports.File({ filename: 'error.log', level: 'error' }),
    new transports.File({ filename: 'combined.log' }),
    new transports.Console({ level: 'silly', format: colorFormat })
  ]
})

// const log = function ( level, logObj ) {
//   const chalkFn = level === 'success' ? chalk.green : level === 'error' ? chalk.red.bold : chalk.white
//   const consoleFn = level === 'error' ? console.error : console.log
//   const time = new Date().toISOString()
//   const outObj = { time, level, ...logObj }
//   consoleFn(chalkFn(JSON.stringify(outObj))) 
// }

module.exports = logger
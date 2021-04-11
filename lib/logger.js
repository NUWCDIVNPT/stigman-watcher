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
  level: 'silly',
  format: format.combine(
    format.timestamp(),
    new JsonFieldOrder(),
    format.json()
  ),
  transports: [
    // new transports.File({ filename: 'error.log', level: 'silly' }),
    // new transports.File({ filename: '/home/csmig/dev/stigman-watcher/combined.log' }),
    // new transports.Console({ level: 'silly', format: colorFormat })
  ]
})

logger.on('finish', function() {
  setImmediate(() => process.exit())
})


const levelStr = ['error', 'warn', 'info', 'http', 'verbose', 'debug', 'silly']

const addConsole = ( level ) => {
  logger.add(new transports.Console({ level: level, format: colorFormat }))
}
const addLogfile = ( level, filename ) => {
  logger.add(new transports.File({ level: level, filename: filename }))
}

module.exports = { logger, addConsole, addLogfile }
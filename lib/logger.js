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

// const colorFormat = format.colorize({ all: true, colors: {
//   info: 'white'
// } })
const colorFormat = format.colorize({ 
  all: true,
  colors: {
    error: 'red',
    warn: 'yellow',
    info: 'green',
    http: 'cyan',
    verbose: 'cyan',
    debug: 'cyan',
    silly: 'grey'
  }
})

const logger = createLogger({
  level: 'silly',
  format: format.combine(
    format.timestamp(),
    new JsonFieldOrder(),
    format.json()
  ),
  transports: []
})

const addConsoleTransport = ( level, colorize, silent ) => {
  const options = {
    level: level,
    silent: silent
  }
  if (colorize) {
    options.format = colorFormat
  }
  logger.add(new transports.Console(options))
}
const addFileTransport = ( level, filename ) => {
  logger.add(new transports.File({ level: level, filename: filename }))
}

module.exports = { logger, addConsoleTransport, addFileTransport }
import { expect } from 'chai'
import fs from 'fs'
import { initHistory, addToHistory, removeFromHistory } from '../../lib/scan.js'
import { logger } from '../../lib/logger.js'
import path from 'path'
import { options } from '../../lib/args.js'

logger.info = () => {}
logger.warn = () => {}
logger.error = () => {}
logger.verbose = () => {}
logger.debug = () => {}
logger.silly = () => {}
logger.http = () => {}


function setOptions (o) {
  for (const [key, value] of Object.entries(o)) {
    options[key] = value
  }
}

describe('testing add/remove/init functions  ', function () {
  const historyFile = './watcher.test.history'
  const scannedPath = './test/testFiles/TestScannedDirectory'

  beforeEach(function () {
    fs.writeFileSync(historyFile, '')
  })

  afterEach(function () {
    fs.unlinkSync(historyFile)
  })

  it('should correctly create an empty history file', async function () {
    setOptions({
      historyFile: historyFile,
      path: scannedPath,
      scanInterval: 15000,
      oneShot: true,
      historyWriteInterval: 10
    })
    initHistory()
    expect(fs.existsSync(historyFile)).to.be.true
    expect(fs.readFileSync(historyFile, 'utf8')).to.equal('')
  })

  it('should correctly add to history file', async function () {
    setOptions({
      historyFile: historyFile,
      path: scannedPath,
      scanInterval: 5000,
      oneShot: true,
      historyWriteInterval: 10
    })

    initHistory()

    const file = './test/testFiles/file1.ckl'

    addToHistory(file)

    await new Promise(resolve => setTimeout(resolve, options.historyWriteInterval))
    const data = fs.readFileSync(historyFile, 'utf8').trim() // Trim the newline character
    expect(data).to.equal(file)
  })

  it('should correctly remove from history file', async function () {
    const options = {
      historyFile: historyFile,
      path: scannedPath,
      scanInterval: 5000,
      oneShot: true,
      historyWriteInterval: 10
    }

    initHistory(options)

    const file = './test/testFiles/file1.ckl'

    addToHistory(file)

    await new Promise(resolve => setTimeout(resolve, options.historyWriteInterval))

    removeFromHistory(file)

    await new Promise(resolve => setTimeout(resolve, options.historyWriteInterval))

    const data = fs.readFileSync(historyFile, 'utf8').trim()

    expect(data).to.equal('')
  })
})

describe('testing starting with empty history file and adding entries', function () {
  const historyFile = './watcher.test.history'
  const scannedPath = './test/testFiles/'
  const fileContents = '<?xml version="1.0" encoding="UTF-8"?>'
  beforeEach(function () {
    fs.writeFileSync(historyFile, '')
    fs.mkdirSync(scannedPath, { recursive: true })
    for (let i = 1; i <= 5; i++) {
      fs.writeFileSync(path.join(scannedPath, `file${i}.ckl`), fileContents)
    }
  })

  afterEach(function () {
    fs.unlinkSync(historyFile)

    const files = fs.readdirSync(scannedPath)
    for (const file of files) {
      fs.unlinkSync(path.join(scannedPath, file))
    }
    fs.rmSync(scannedPath, { recursive: true })
  })

  it('should correctly identify the 5 new files and update the history file with all 5', async function () {
    setOptions({
      historyFile: historyFile,
      path: scannedPath,
      scanInterval: 5000,
      oneShot: true,
      historyWriteInterval: 10
    })

    // create history file
    initHistory()

 
    const files = fs.readdirSync(scannedPath)
    for (const file of files) {
      addToHistory(path.join(scannedPath, file))
    }


    await new Promise(resolve =>
      setTimeout(resolve, options.historyWriteInterval)
    )

    // read the history file
    const data = fs.readFileSync(historyFile, 'utf8')
    const lines = data.split('\n').filter(line => line.trim() !== '')

    expect(lines.length).to.equal(5)

    const expectedHistoryEntries = [
      'test/testFiles/file1.ckl',
      'test/testFiles/file2.ckl',
      'test/testFiles/file3.ckl',
      'test/testFiles/file4.ckl',
      'test/testFiles/file5.ckl'
    ]

    for (const entry of expectedHistoryEntries) {
      expect(lines).to.include(entry)
    }
  })
})

describe('testing starting with empty history file and slowly adding and removing items to history manually', function () {
  this.timeout(5000)
  const historyFile = './watcher.test.history'
  const scannedPath = './test/testFiles/'

  beforeEach(function () {
    fs.writeFileSync(historyFile, '')
  })

  afterEach(function () {
    fs.unlinkSync(historyFile)
  })

  it('should correctly remove the 2 files history file skip 2 files already in the history file and scanned directory and add one file to the history file', async function () {
    setOptions({
      historyFile: historyFile,
      path: scannedPath,
      scanInterval: 5000,
      oneShot: true,
      historyWriteInterval: 50
    })

    // create history file
    initHistory()

    addToHistory('./test/testFiles/file1.ckl')
    addToHistory('./test/testFiles/file2.ckl')

    await new Promise(resolve => setTimeout(resolve, options.historyWriteInterval))

    // read the history file
    const data = fs.readFileSync(historyFile, 'utf8')
    const lines = data.split('\n').filter(line => line.trim() !== '')

    expect(lines.length).to.equal(2)
    expect(lines).to.include('./test/testFiles/file1.ckl')
    expect(lines).to.include('./test/testFiles/file2.ckl')

    removeFromHistory('./test/testFiles/file1.ckl')

    await new Promise(resolve => setTimeout(resolve, options.historyWriteInterval))

    // read the history file
    const data2 = fs.readFileSync(historyFile, 'utf8')
    const lines2 = data2.split('\n').filter(line => line.trim() !== '')

    expect(lines2.length).to.equal(1)
    expect(lines2).to.include('./test/testFiles/file2.ckl')
  })
})

describe('testing no history file mode', function () {
  const historyFile = null
  const scannedPath = './test/testFiles/'

  it('should correctly run in no history file mode', async function () {
    setOptions({
      historyFile: historyFile,
      path: scannedPath,
      scanInterval: 5000,
      oneShot: true,
      historyWriteInterval: 10
    })

    initHistory()

    const file = './test/testFiles/file1.ckl'

    addToHistory(file)

    await new Promise(resolve => setTimeout(resolve, options.historyWriteInterval))

    // expect no history file to be created
    expect(fs.existsSync(historyFile)).to.be.false
  })
})

describe('cleaning up', function () {
  after(async function () {
    setTimeout(() => {
      process.exit(0) // Delayed exit to allow Mocha to output results
    }, 1000) // Adjust time as necessary for your environment
  })

  it('should clean up the history file', function () {
    const historyFilePath = './watcher.test.history'
    // Check if the file exists and delete it
    if (fs.existsSync(historyFilePath)) {
      fs.unlinkSync(historyFilePath)
    }
  })
})

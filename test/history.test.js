import { expect } from 'chai'
import sinon from 'sinon'
import fs from 'node:fs'
import { dirname } from 'path'
import path from 'node:path'
import { fileURLToPath } from 'url'
import {
  initHistory,
  getHistory,
  addToHistory,
  removeFromHistory,
  setHistory,
  saveCurrentHistoryToFile,
  flushWriteQueue
} from '../lib/scan.js'

const writeFile = (file, data) =>
  new Promise((resolve, reject) => {
    fs.writeFile(file, data, err => {
      if (err) reject(err)
      else resolve()
    })
  })

const unlink = file =>
  new Promise((resolve, reject) => {
    fs.unlink(file, err => {
      if (err) reject(err)
      else resolve()
    })
  })

const rm = dir =>
  new Promise((resolve, reject) => {
    fs.rm(dir, { recursive: true, force: true }, err => {
      if (err) reject(err)
      else resolve()
    })
  })
const mkdir = dir =>
  new Promise((resolve, reject) => {
    fs.mkdir(dir, { recursive: true }, err => {
      if (err) reject(err)
      else resolve()
    })
  })
async function setUpMockEnvironment (
  mockDirPath,
  historyDirPath,
  mockFiles,
  mockHistoryFilePath,
  initialHistoryContent
) {
  // Create mock directory
  await mkdir(mockDirPath)

  await mkdir(historyDirPath)

  // Create mock files
  for (const file of mockFiles) {
    const filePath = path.join(mockDirPath, file)
    await writeFile(filePath, 'Dummy content...')
  }

  // Create and write initial content to mock history file
  await writeFile(mockHistoryFilePath, initialHistoryContent)
}

async function tearDownMockEnvironment (
  mockDirPath,
  historyDirPath,
  mockFiles,
  mockHistoryFilePath
) {
  // Delete mock files
  for (const file of mockFiles) {
    const filePath = path.join(mockDirPath, file)
    await unlink(filePath)
  }

  // Remove mock directory
  await rm(mockDirPath)

  // Delete mock history file and remove history directory
  await unlink(mockHistoryFilePath)
  await rm(historyDirPath)
}

describe('startScanner history file testing', function () {
  const mockDirPath = path.join(process.cwd(), 'mock-directory')
  const historyDirPath = path.join(process.cwd(), 'history-directory') // Separate directory for history
  const mockFiles = [
    'mockFile1.ckl',
    'mockFile2.xml',
    'mockFile3.cklb',
    'mockFile4.cklb',
    'mockFile5.cklb'
  ]
  const mockHistoryFilePath = path.join(historyDirPath, 'history.txt')
  const initialHistoryContent = ''

  beforeEach(async () => {
    await setUpMockEnvironment(
      mockDirPath,
      historyDirPath,
      mockFiles,
      mockHistoryFilePath,
      initialHistoryContent
    )
  })

  afterEach(async () => {
    await tearDownMockEnvironment(
      mockDirPath,
      historyDirPath,
      mockFiles,
      mockHistoryFilePath
    )
  })

  it('should add 5 items to history and see them in the history file ', async function () {
    const options = {
      historyFile: mockHistoryFilePath,
      path: mockDirPath,
      scanInterval: 10000,
      oneShot: true,
      historyCargoSize: 4,
      historyCargoDelay: 10000
    }
    initHistory(options)

    const startingHistoryContent = fs.readFileSync(mockHistoryFilePath, 'utf-8')

    const startingMockdir = fs.readdirSync(mockDirPath)

    console.log('mickdir', JSON.stringify(startingMockdir))

    console.log('starting', startingHistoryContent)

    for await (const file of mockFiles) {
      addToHistory(file)
    }

    // await startScanner(options)

    //  flushWriteQueue()

    setTimeout(() => {}, 1000)

    const set = getHistory()

    const historyContent = fs.readFileSync(mockHistoryFilePath, 'utf-8')

    console.log('ending', JSON.stringify(historyContent))
  })
})

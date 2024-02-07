// import { expect } from 'chai'
// import sinon from 'sinon'
// import fs from 'node:fs'
// import esmock from 'esmock'
// import { dirname } from 'path';
// import path from 'node:path'
// import { fileURLToPath } from 'url';
// const __filename = fileURLToPath(import.meta.url);
// const __dirname = dirname(__filename);
// import {
//   initHistory, 
//   getHistory,
//   addToHistory,
//   removeFromHistory,
//   setHistory,
//   saveCurrentHistoryToFile,
//   flushWriteQueue
//   } from '../lib/scan.js'
  

  
//   describe('History File Logic', function() {
//     const mockDirPath = path.join(__dirname, 'mock-directory');
//     const historyDirPath = path.join(__dirname, 'history-directory'); // Separate directory for history
//     const mockFiles = ['mockFile1.ckl', 'mockFile2.xml', 'mockFile3.cklb', 'mockFile4.cklb', 'mockFile5.cklb'];
//     const mockHistoryFilePath = path.join(historyDirPath, 'history.txt');
//     const initialHistoryContent = '';
//     beforeEach(() => {
     
//     });
  
//     afterEach(() => {

//     });
  
//     it('should add entries to history and verify file contents', async function() {
//       it('should write all contents from watched directory to an empty history file.', async function () {
//         // Mock fs and other dependencies here using esmock
//         const localfs = await esmock('fs', {
//           fs: {
//             readFileSync: () => 'mocked file content',
//             writeFileSync: () => {}
//             // Mock other fs methods as needed
//           }
//         });
    
//         const options = {
//           historyFile: mockHistoryFilePath,
//           path: mockDirPath,
//           scanInterval: 10000,
//           oneShot: true,
//           historyCargoSize: 5,
//           historyCargoDelay: 10000
//         };
        
//         initHistory(options);
    
//         await startScanner(options);
    
//         // Verify the contents of the history file
//         const historyContent = fs.readFileSync(mockHistoryFilePath, 'utf-8');
        
//         // Your assertion here to check historyContent contains what you expect
//       });
//     });
//   });
  
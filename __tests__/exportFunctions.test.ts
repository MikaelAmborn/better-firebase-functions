/* eslint-disable jest/no-hooks */
import fs from 'fs-extra';
import { rimrafSync } from 'rimraf';
import { resolve } from 'path';
import tmp from 'tmp';
import * as bff from '../src/export-functions';

function generateTestDir(dirPath: string, filePaths: string[], fileContents: string) {
  const fileBuffer = Buffer.from(fileContents);
  console.log('temp dir: ', dirPath);
  filePaths.forEach((path) => {
    if (path.indexOf('multi.func.ts') > -1) {
      fs.outputFileSync(resolve(dirPath, path), Buffer.from('export const func1 = 1;\nexport const func2 = 2;'));
    } else {
      fs.outputFileSync(resolve(dirPath, path), fileBuffer)
    }
  });
}

describe('exportFunctions() function exporter test suite', () => {
  const testFiles = [
    'pretend-index.ts',
    'sample.func.ts',
    'camel-case-func.func.ts',
    './empty-folder/',
    'folder/new.func.ts',
    'folder/not-a-func.ts',
    'folder/nestedFolder/sample-func.func.ts',
    'folder/nestedFolder/sample-js-func.func.js',
    'folder/multipleFuncs/multi.func.ts'
  ];
  const { name: tempFuncDir } = tmp.dirSync();
  const randOutput = Math.floor(Math.random() * 10);
  const filePathToPropertyPath = (moduleFilePath: string) => {
    const funcNames = bff.funcNameFromRelPathDefault(moduleFilePath);
    return funcNames[0].split('-').join('.');
  };

  beforeEach(() => {
    jest.resetAllMocks();
    delete process.env.K_SERVICE;
    delete process.env.FUNCTION_NAME;
  });

  beforeAll(() => {
    generateTestDir(tempFuncDir, testFiles, `export default ${randOutput};`);
  });

  afterAll(() => {
    rimrafSync(tempFuncDir);
    tmp.setGracefulCleanup();
  });

  const exportTestFactory = (configObj?: any) =>
    // eslint-disable-next-line implicit-arrow-linebreak
    bff.exportFunctions({
      __dirname: tempFuncDir,
      __filename: `${tempFuncDir}/pretend-index.ts`,
      exports: {},
      searchGlob: '**/*.func.{ts,js}',
      ...configObj,
    });

  it('should not export itself', () => {
    expect(exportTestFactory()).not.toHaveProperty(filePathToPropertyPath(testFiles[0]));
  });

  it('should export from the default export of each submodule', () => {
    expect(exportTestFactory()).toHaveProperty(filePathToPropertyPath(testFiles[1]), randOutput);
  });

  it('should properly nest submodules found in directories', () => {
    expect(exportTestFactory()).toHaveProperty(filePathToPropertyPath(testFiles[4]), randOutput); // func
    expect(exportTestFactory()).not.toHaveProperty(filePathToPropertyPath(testFiles[3]), randOutput); // empty folder
    expect(exportTestFactory()).toHaveProperty(filePathToPropertyPath(testFiles[6]), randOutput); // nested func
  });

  it('should correctly apply camelCase to kebab-case named files', () => {
    expect(exportTestFactory()).toHaveProperty(filePathToPropertyPath(testFiles[2]), randOutput);
  });

  it('should correctly identify files not to export due to the glob match', () => {
    expect(exportTestFactory()).not.toHaveProperty(filePathToPropertyPath(testFiles[5]));
  });

  fit('should use provided extractTrigger and funcNameFromRelPath if provided', () => {
    console.log('my test')
    const testObj = exportTestFactory({
      extractTrigger: (inputModule: any, theFunc?: string, currentFunctionName?: string) => {
        if (inputModule['default']) return inputModule['default'];
        console.log({inputModule, theFunc, currentFunctionName});
        if (theFunc) { console.log(`returning ${inputModule[theFunc]}`); return inputModule[theFunc]; }
        return currentFunctionName ? inputModule[currentFunctionName] : undefined;
      },
      funcNameFromRelPath: (path: string) => {
        console.log(`funcNameFromRelPath ${path}`);
        const file = fs.readFileSync(resolve(tempFuncDir, path), 'utf-8');
        const namedExports = [...file.matchAll(/export const (\w+) =/g)].map(m => m[1]);
        console.log(namedExports);
        if (namedExports.length) return namedExports;
        return bff.funcNameFromRelPathDefault(path);
      }
    });
    console.log('done');
    console.log(JSON.stringify(testObj));
  });
  it('should run custom function name generator if provided', () => {
    const funcGenSpy = jest.fn(bff.funcNameFromRelPathDefault);
    exportTestFactory({ funcNameFromRelPath: funcGenSpy });
    // eslint-disable-next-line jest/prefer-called-with
    expect(funcGenSpy).toHaveBeenCalled();
  });

  it('should work without __dirname parameter', () => {
    const testObj = exportTestFactory({
      __dirname: undefined,
      enableLogger: true,
    });
    console.log('other test');
    console.log(JSON.stringify(testObj));
    expect(testObj).toHaveProperty(filePathToPropertyPath(testFiles[1]), randOutput);
  });

  it('should only extract one module when K_SERVICE present', () => {
    process.env.K_SERVICE = bff.funcNameFromRelPathDefault(testFiles[1])[0];
    const result = exportTestFactory({ enableLogger: true });
    expect(result).not.toHaveProperty(filePathToPropertyPath(testFiles[2]));
    expect(result).toHaveProperty(filePathToPropertyPath(testFiles[1]));
    expect(Object.keys(result)).toHaveLength(1);
  });

  it('should only extract one module when FUNCTION_NAME present', () => {
    process.env.FUNCTION_NAME = bff.funcNameFromRelPathDefault(testFiles[1])[0];
    const result = exportTestFactory({ enableLogger: true });
    expect(result).not.toHaveProperty(filePathToPropertyPath(testFiles[2]));
    expect(result).toHaveProperty(filePathToPropertyPath(testFiles[1]));
    expect(Object.keys(result)).toHaveLength(1);
  });

  it('will still work with glob match prepending ./ as in ./**/*.js', () => {
    expect(exportTestFactory({ searchGlob: './**/*.func.ts' })).toHaveProperty(filePathToPropertyPath(testFiles[1]));
    expect(exportTestFactory({ searchGlob: '**/*.func.ts' })).toHaveProperty(filePathToPropertyPath(testFiles[1]));
  });

  it('will provide a paths mode for buildtools', () => {
    const output = exportTestFactory({ exportPathMode: true });
    console.log(output);
    expect(output).toHaveProperty(filePathToPropertyPath(testFiles[4]), testFiles[4]);
  });

  it('can detect both js and ts files using updated glob search - new default', () => {
    const output = exportTestFactory({ exportPathMode: true });
    expect(output).toHaveProperty(filePathToPropertyPath(testFiles[7]), testFiles[7]); // js file
  });
});

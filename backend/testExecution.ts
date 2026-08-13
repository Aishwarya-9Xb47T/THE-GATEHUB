/**
 * Test script for languageExecutionService
 * Tests basic Python execution
 */

import { executeCode } from './src/services/codeExecution/languageExecutionService.js';

async function testPrintHello() {
  console.log('Test 1: print("hello")');
  const result = await executeCode({
    action: 'run',
    language: 'python',
    code: 'print("hello")',
  });
  console.log('Result:', result);
  console.log('Expected: hello');
  console.log('Match:', result.stdout.trim() === 'hello');
  console.log('---');
}

async function testVariable() {
  console.log('Test 2: x=5; print(x)');
  const result = await executeCode({
    action: 'run',
    language: 'python',
    code: 'x=5\nprint(x)',
  });
  console.log('Result:', result);
  console.log('Expected: 5');
  console.log('Match:', result.stdout.trim() === '5');
  console.log('---');
}

async function testFunction() {
  console.log('Test 3: def add(a,b): return a+b; print(add(2,3))');
  const result = await executeCode({
    action: 'run',
    language: 'python',
    code: 'def add(a,b):\n    return a+b\nprint(add(2,3))',
  });
  console.log('Result:', result);
  console.log('Expected: 5');
  console.log('Match:', result.stdout.trim() === '5');
  console.log('---');
}

async function testEmptyFunction() {
  console.log('Test 4: def test(): pass; test()');
  const result = await executeCode({
    action: 'run',
    language: 'python',
    code: 'def test():\n    pass\ntest()',
  });
  console.log('Result:', result);
  console.log('Expected: (no output, no errors)');
  console.log('Success:', result.success && result.stderr === '');
  console.log('---');
}

async function runTests() {
  try {
    await testPrintHello();
    await testVariable();
    await testFunction();
    await testEmptyFunction();
    console.log('All tests completed');
  } catch (error) {
    console.error('Test failed:', error);
  }
}

runTests();

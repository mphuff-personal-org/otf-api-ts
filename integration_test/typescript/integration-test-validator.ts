#!/usr/bin/env ts-node
/**
 * Integration test validator
 * Compares Python and TypeScript OTF API results to ensure 100% data consistency
 */

import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

interface TestResult {
  success: boolean;
  data?: any;
  error?: string;
  [key: string]: any;
}

interface IntegrationTestResults {
  timestamp: string;
  tests: Record<string, TestResult>;
  errors: string[];
  [key: string]: any;
}

interface ValidationResult {
  test_name: string;
  both_successful: boolean;
  data_identical: boolean;
  differences: any[];
  python_only_fields: string[];
  typescript_only_fields: string[];
  field_count_python: number;
  field_count_typescript: number;
  notes: string[];
}

interface ValidationSummary {
  timestamp: string;
  total_tests: number;
  tests_with_data: number;
  identical_results: number;
  different_results: number;
  python_only_successes: number;
  typescript_only_successes: number;
  both_failed: number;
  validation_results: ValidationResult[];
  overall_success: boolean;
  summary_notes: string[];
}

function deepCompare(obj1: any, obj2: any, path: string = ''): any[] {
  /**
   * Deep compare two objects and return differences
   */
  const differences: any[] = [];
  
  if (obj1 === obj2) {
    return differences;
  }
  
  if (typeof obj1 !== typeof obj2) {
    differences.push({
      path,
      type: 'type_mismatch',
      python_value: obj1,
      typescript_value: obj2,
      python_type: typeof obj1,
      typescript_type: typeof obj2
    });
    return differences;
  }
  
  if (obj1 === null || obj2 === null || typeof obj1 !== 'object') {
    differences.push({
      path,
      type: 'value_difference',
      python_value: obj1,
      typescript_value: obj2
    });
    return differences;
  }
  
  if (Array.isArray(obj1) && Array.isArray(obj2)) {
    if (obj1.length !== obj2.length) {
      differences.push({
        path,
        type: 'array_length_difference',
        python_length: obj1.length,
        typescript_length: obj2.length
      });
    }
    
    const maxLength = Math.max(obj1.length, obj2.length);
    for (let i = 0; i < maxLength; i++) {
      const itemPath = `${path}[${i}]`;
      if (i >= obj1.length) {
        differences.push({
          path: itemPath,
          type: 'missing_in_python',
          typescript_value: obj2[i]
        });
      } else if (i >= obj2.length) {
        differences.push({
          path: itemPath,
          type: 'missing_in_typescript',
          python_value: obj1[i]
        });
      } else {
        differences.push(...deepCompare(obj1[i], obj2[i], itemPath));
      }
    }
    return differences;
  }
  
  if (Array.isArray(obj1) || Array.isArray(obj2)) {
    differences.push({
      path,
      type: 'array_vs_object',
      python_is_array: Array.isArray(obj1),
      typescript_is_array: Array.isArray(obj2),
      python_value: obj1,
      typescript_value: obj2
    });
    return differences;
  }
  
  // Compare object properties
  const keys1 = Object.keys(obj1);
  const keys2 = Object.keys(obj2);
  const allKeys = new Set([...keys1, ...keys2]);
  
  for (const key of allKeys) {
    const keyPath = path ? `${path}.${key}` : key;
    
    if (!(key in obj1)) {
      differences.push({
        path: keyPath,
        type: 'missing_in_python',
        typescript_value: obj2[key]
      });
    } else if (!(key in obj2)) {
      differences.push({
        path: keyPath,
        type: 'missing_in_typescript',
        python_value: obj1[key]
      });
    } else {
      differences.push(...deepCompare(obj1[key], obj2[key], keyPath));
    }
  }
  
  return differences;
}

function getFieldPaths(obj: any, prefix: string = ''): string[] {
  /**
   * Get all field paths from an object (flattened)
   */
  if (obj === null || typeof obj !== 'object') {
    return [prefix];
  }
  
  if (Array.isArray(obj)) {
    const paths: string[] = [];
    obj.forEach((item, index) => {
      paths.push(...getFieldPaths(item, `${prefix}[${index}]`));
    });
    return paths;
  }
  
  const paths: string[] = [];
  Object.keys(obj).forEach(key => {
    const newPrefix = prefix ? `${prefix}.${key}` : key;
    paths.push(...getFieldPaths(obj[key], newPrefix));
  });
  
  return paths;
}

function validateTestResults(pythonResults: IntegrationTestResults, typescriptResults: IntegrationTestResults): ValidationSummary {
  /**
   * Validate and compare Python vs TypeScript test results
   */
  const validationResults: ValidationResult[] = [];
  const summaryNotes: string[] = [];
  
  // Get all test names from both results
  const allTestNames = new Set([
    ...Object.keys(pythonResults.tests),
    ...Object.keys(typescriptResults.tests)
  ]);
  
  let testsWithData = 0;
  let identicalResults = 0;
  let differentResults = 0;
  let pythonOnlySuccesses = 0;
  let typescriptOnlySuccesses = 0;
  let bothFailed = 0;
  
  for (const testName of allTestNames) {
    const pythonTest = pythonResults.tests[testName];
    const typescriptTest = typescriptResults.tests[testName];
    
    const validation: ValidationResult = {
      test_name: testName,
      both_successful: false,
      data_identical: false,
      differences: [],
      python_only_fields: [],
      typescript_only_fields: [],
      field_count_python: 0,
      field_count_typescript: 0,
      notes: []
    };
    
    // Check if both tests exist and were successful
    const pythonSuccess = pythonTest?.success === true;
    const typescriptSuccess = typescriptTest?.success === true;
    
    validation.both_successful = pythonSuccess && typescriptSuccess;
    
    if (!pythonTest && typescriptTest) {
      validation.notes.push('Test only exists in TypeScript results');
      if (typescriptSuccess) typescriptOnlySuccesses++;
    } else if (pythonTest && !typescriptTest) {
      validation.notes.push('Test only exists in Python results');
      if (pythonSuccess) pythonOnlySuccesses++;
    } else if (!pythonSuccess && !typescriptSuccess) {
      validation.notes.push('Both implementations failed');
      bothFailed++;
    } else if (pythonSuccess && !typescriptSuccess) {
      validation.notes.push('Python succeeded, TypeScript failed');
      pythonOnlySuccesses++;
    } else if (!pythonSuccess && typescriptSuccess) {
      validation.notes.push('TypeScript succeeded, Python failed');
      typescriptOnlySuccesses++;
    } else if (validation.both_successful) {
      // Both successful - compare data
      testsWithData++;
      
      const pythonData = pythonTest.data;
      const typescriptData = typescriptTest.data;
      
      // Get field counts
      if (pythonData) {
        validation.field_count_python = getFieldPaths(pythonData).length;
      }
      if (typescriptData) {
        validation.field_count_typescript = getFieldPaths(typescriptData).length;
      }
      
      // Compare data
      validation.differences = deepCompare(pythonData, typescriptData);
      validation.data_identical = validation.differences.length === 0;
      
      if (validation.data_identical) {
        identicalResults++;
        validation.notes.push('Data is 100% identical');
      } else {
        differentResults++;
        validation.notes.push(`Found ${validation.differences.length} differences`);
        
        // Categorize differences
        const pythonOnlyFields = new Set<string>();
        const typescriptOnlyFields = new Set<string>();
        
        validation.differences.forEach(diff => {
          if (diff.type === 'missing_in_typescript') {
            pythonOnlyFields.add(diff.path);
          } else if (diff.type === 'missing_in_python') {
            typescriptOnlyFields.add(diff.path);
          }
        });
        
        validation.python_only_fields = Array.from(pythonOnlyFields);
        validation.typescript_only_fields = Array.from(typescriptOnlyFields);
      }
    }
    
    validationResults.push(validation);
  }
  
  // Generate summary notes
  if (identicalResults === testsWithData && testsWithData > 0) {
    summaryNotes.push('🎉 All successful tests have 100% identical data!');
  } else if (differentResults > 0) {
    summaryNotes.push(`⚠️  ${differentResults} tests have data differences`);
  }
  
  if (pythonOnlySuccesses > 0) {
    summaryNotes.push(`⚠️  ${pythonOnlySuccesses} tests only succeeded in Python`);
  }
  
  if (typescriptOnlySuccesses > 0) {
    summaryNotes.push(`⚠️  ${typescriptOnlySuccesses} tests only succeeded in TypeScript`);
  }
  
  if (bothFailed > 0) {
    summaryNotes.push(`❌ ${bothFailed} tests failed in both implementations`);
  }
  
  const overallSuccess = differentResults === 0 && pythonOnlySuccesses === 0 && typescriptOnlySuccesses === 0;
  
  return {
    timestamp: new Date().toISOString(),
    total_tests: allTestNames.size,
    tests_with_data: testsWithData,
    identical_results: identicalResults,
    different_results: differentResults,
    python_only_successes: pythonOnlySuccesses,
    typescript_only_successes: typescriptOnlySuccesses,
    both_failed: bothFailed,
    validation_results: validationResults,
    overall_success: overallSuccess,
    summary_notes: summaryNotes
  };
}

function main() {
  /**
   * Main entry point for validation
   */
  console.log('🔍 Starting Integration Test Validation');
  console.log('=' .repeat(60));
  
  const typescriptDir = __dirname;
  const integrationTestDir = join(typescriptDir, '..');
  const pythonResultsFile = join(integrationTestDir, 'integration-test-results-python.json');
  const typescriptResultsFile = join(typescriptDir, 'integration-test-results-typescript.json');
  
  // Check if both result files exist
  if (!existsSync(pythonResultsFile)) {
    console.error(`❌ Python results file not found: ${pythonResultsFile}`);
    console.log('   Run: python scripts/integration-test-python.py');
    process.exit(1);
  }
  
  if (!existsSync(typescriptResultsFile)) {
    console.error(`❌ TypeScript results file not found: ${typescriptResultsFile}`);
    console.log('   Run: npx ts-node scripts/integration-test-typescript.ts');
    process.exit(1);
  }
  
  // Load results
  console.log('📄 Loading test results...');
  const pythonResults: IntegrationTestResults = JSON.parse(readFileSync(pythonResultsFile, 'utf-8'));
  const typescriptResults: IntegrationTestResults = JSON.parse(readFileSync(typescriptResultsFile, 'utf-8'));
  
  console.log(`   Python: ${Object.keys(pythonResults.tests).length} tests at ${pythonResults.timestamp}`);
  console.log(`   TypeScript: ${Object.keys(typescriptResults.tests).length} tests at ${typescriptResults.timestamp}`);
  
  // Validate results
  console.log('🔍 Comparing results...');
  const validation = validateTestResults(pythonResults, typescriptResults);
  
  // Output validation summary
  console.log('\n' + '='.repeat(60));
  console.log('📊 VALIDATION SUMMARY');
  console.log('=' .repeat(60));
  console.log(`Total Tests: ${validation.total_tests}`);
  console.log(`Tests with Data: ${validation.tests_with_data}`);
  console.log(`Identical Results: ${validation.identical_results}`);
  console.log(`Different Results: ${validation.different_results}`);
  console.log(`Python-only Successes: ${validation.python_only_successes}`);
  console.log(`TypeScript-only Successes: ${validation.typescript_only_successes}`);
  console.log(`Both Failed: ${validation.both_failed}`);
  console.log(`Overall Success: ${validation.overall_success ? '✅' : '❌'}`);
  
  // Output summary notes
  if (validation.summary_notes.length > 0) {
    console.log('\n📋 NOTES:');
    validation.summary_notes.forEach(note => console.log(`   ${note}`));
  }
  
  // Output detailed results for failing tests
  const problemTests = validation.validation_results.filter(v => 
    !v.data_identical || !v.both_successful
  );
  
  if (problemTests.length > 0) {
    console.log('\n' + '='.repeat(60));
    console.log('🔍 DETAILED ANALYSIS');
    console.log('=' .repeat(60));
    
    problemTests.forEach(test => {
      console.log(`\n📋 ${test.test_name}:`);
      console.log(`   Both Successful: ${test.both_successful ? '✅' : '❌'}`);
      console.log(`   Data Identical: ${test.data_identical ? '✅' : '❌'}`);
      console.log(`   Python Fields: ${test.field_count_python}`);
      console.log(`   TypeScript Fields: ${test.field_count_typescript}`);
      
      if (test.notes.length > 0) {
        console.log('   Notes:');
        test.notes.forEach(note => console.log(`     - ${note}`));
      }
      
      if (test.differences.length > 0) {
        console.log(`   Differences (${test.differences.length}):`);
        test.differences.slice(0, 5).forEach(diff => {  // Show first 5 differences
          console.log(`     - ${diff.path}: ${diff.type}`);
          if (diff.python_value !== undefined) {
            console.log(`       Python: ${JSON.stringify(diff.python_value)}`);
          }
          if (diff.typescript_value !== undefined) {
            console.log(`       TypeScript: ${JSON.stringify(diff.typescript_value)}`);
          }
        });
        if (test.differences.length > 5) {
          console.log(`     ... and ${test.differences.length - 5} more differences`);
        }
      }
      
      if (test.python_only_fields.length > 0) {
        console.log(`   Python-only fields: ${test.python_only_fields.join(', ')}`);
      }
      
      if (test.typescript_only_fields.length > 0) {
        console.log(`   TypeScript-only fields: ${test.typescript_only_fields.join(', ')}`);
      }
    });
  }
  
  // Save detailed validation results
  const validationOutputFile = join(typescriptDir, 'integration-validation-results.json');
  console.log(`\n📄 Saving detailed validation to: ${validationOutputFile}`);
  require('fs').writeFileSync(validationOutputFile, JSON.stringify(validation, null, 2));
  
  console.log('\n' + '='.repeat(60));
  if (validation.overall_success) {
    console.log('🎉 VALIDATION PASSED: Python and TypeScript implementations are identical!');
  } else {
    console.log('❌ VALIDATION FAILED: Implementations have differences');
  }
  console.log('=' .repeat(60));
  
  // Exit with appropriate code
  process.exit(validation.overall_success ? 0 : 1);
}

// Run if called directly
if (require.main === module) {
  main();
}

export { validateTestResults, deepCompare };
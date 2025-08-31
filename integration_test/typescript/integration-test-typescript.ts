#!/usr/bin/env ts-node
/**
 * TypeScript integration test script for OTF API
 * Fetches data from key APIs and outputs to JSON for comparison with Python implementation
 */

import { writeFileSync, readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { Otf } from '../../src/otf';

function loadEnvFile(): void {
  /**
   * Load .env file from project root if it exists
   */
  // Find project root (two levels up from this script)
  const projectRoot = join(__dirname, '..', '..');
  const envFile = join(projectRoot, '.env');
  
  if (existsSync(envFile)) {
    console.log('📄 Loading environment from .env file');
    const envContent = readFileSync(envFile, 'utf-8');
    envContent.split('\n').forEach(line => {
      const trimmedLine = line.trim();
      if (trimmedLine && !trimmedLine.startsWith('#') && trimmedLine.includes('=')) {
        const [key, ...valueParts] = trimmedLine.split('=');
        let value = valueParts.join('=');
        
        // Remove quotes if present
        if ((value.startsWith('"') && value.endsWith('"')) || 
            (value.startsWith("'") && value.endsWith("'"))) {
          value = value.slice(1, -1);
        }
        
        // Only set if not already in environment
        if (!process.env[key]) {
          process.env[key] = value;
        }
      }
    });
    console.log(`✓ Loaded environment variables: ${Object.keys(process.env).filter(k => k.startsWith('OTF_')).join(', ')}`);
  } else {
    console.log('⚠️  No .env file found, using environment variables');
  }
}

interface TestResult {
  success: boolean;
  data?: any;
  error?: string;
  [key: string]: any;
}

interface IntegrationTestResults {
  timestamp: string;
  typescript_version: string;
  otf_api_ts_version: string;
  tests: Record<string, TestResult>;
  errors: string[];
}

function safeSerialize(obj: any): any {
  /**
   * Safely serialize objects for JSON output, matching Python's serialization
   */
  if (obj === null || obj === undefined) {
    return obj;
  }
  
  if (obj instanceof Date) {
    return obj.toISOString();
  }
  
  if (typeof obj === 'object') {
    if (Array.isArray(obj)) {
      return obj.map(item => safeSerialize(item));
    } else {
      const result: any = {};
      for (const [key, value] of Object.entries(obj)) {
        if (!key.startsWith('_')) {  // Skip private properties
          result[key] = safeSerialize(value);
        }
      }
      return result;
    }
  }
  
  return obj;
}

async function runTypeScriptIntegrationTests(): Promise<IntegrationTestResults | null> {
  /**
   * Run integration tests against TypeScript OTF API
   */
  
  // Get credentials from environment
  const email = process.env.OTF_EMAIL;
  const password = process.env.OTF_PASSWORD;
  
  if (!email) {
    console.error('ERROR: OTF_EMAIL environment variable required');
    return null;
  }
  
  console.log(`🔷 Running TypeScript integration tests for ${email}`);
  
  const results: IntegrationTestResults = {
    timestamp: new Date().toISOString(),
    typescript_version: process.version,
    otf_api_ts_version: '1.0.0',  // Current version
    tests: {},
    errors: []
  };
  
  try {
    // Initialize OTF client
    const otf = password 
      ? new Otf({ email, password })
      : new Otf({ email });
    
    console.log('✓ OTF client created');
    
    // Authenticate the client
    await otf.initialize();
    console.log('✓ OTF client authenticated');
    
    // Test 1: Get Member Details
    try {
      console.log('📋 Testing member details...');
      const member = await otf.member;
      const memberData = safeSerialize(member);
      results.tests.member_detail = {
        success: true,
        data: memberData,
        member_uuid: memberData?.member_uuid,
        home_studio_uuid: memberData?.home_studio?.studio_uuid
      };
      console.log(`✓ Member: ${memberData?.first_name} ${memberData?.last_name}`);
    } catch (error) {
      const errorMsg = `Member details failed: ${error instanceof Error ? error.message : String(error)}`;
      console.log(`✗ ${errorMsg}`);
      results.tests.member_detail = { success: false, error: errorMsg };
      results.errors.push(errorMsg);
    }
    
    // Test 2: Get Home Studio Details
    try {
      console.log('🏢 Testing home studio details...');
      const member = await otf.member;
      if (member?.home_studio?.studio_uuid) {
        const studio = await otf.studios.getStudioDetail(member.home_studio.studio_uuid);
        const studioData = safeSerialize(studio);
        results.tests.home_studio_detail = {
          success: true,
          data: studioData,
          studio_uuid: member.home_studio.studio_uuid
        };
        console.log(`✓ Home Studio: ${studioData?.name}`);
      } else {
        console.log('⚠ No home studio found for member');
        results.tests.home_studio_detail = { success: false, error: 'No home studio' };
      }
    } catch (error) {
      const errorMsg = `Home studio failed: ${error instanceof Error ? error.message : String(error)}`;
      console.log(`✗ ${errorMsg}`);
      results.tests.home_studio_detail = { success: false, error: errorMsg };
      results.errors.push(errorMsg);
    }
    
    // Test 3: Get Recent Workouts (last 35 days)
    try {
      console.log('💪 Testing recent workouts...');
      const endDate = new Date();
      const startDate = new Date(endDate.getTime() - (35 * 24 * 60 * 60 * 1000)); // Extended to 35 days to include 7/29 workout
      
      console.log(`Debug: Calling getWorkouts(${startDate.toISOString()}, ${endDate.toISOString()})`);
      const workouts = await otf.workouts.getWorkouts(startDate, endDate);
      console.log(`Debug: getWorkouts returned ${workouts?.length || 0} workouts`);
      
      if (workouts && workouts.length > 0) {
        console.log(`Debug: First workout structure:`, Object.keys(workouts[0] || {}));
      }
      
      const workoutsData = safeSerialize(workouts);
      results.tests.recent_workouts = {
        success: true,
        data: workoutsData,
        count: workouts?.length || 0,
        date_range: {
          start: startDate.toISOString(),
          end: endDate.toISOString()
        }
      };
      console.log(`✓ Found ${workouts?.length || 0} recent workouts`);
    } catch (error) {
      const errorMsg = `Recent workouts failed: ${error instanceof Error ? error.message : String(error)}`;
      console.log(`✗ ${errorMsg}`);
      results.tests.recent_workouts = { success: false, error: errorMsg };
      results.errors.push(errorMsg);
    }
    
    // Test 4: Get Performance Summary (from embedded workout data to match real-world usage)
    try {
      const workouts = results.tests.recent_workouts?.data || [];
      if (workouts && workouts.length > 0) {
        console.log('📊 Testing performance summary...');
        const firstWorkout = workouts[0];
        if (firstWorkout.performance_summary_id) {
          // Use workout-embedded performance data (matches Python approach and real-world usage)
          // Note: This emulates how otf-advanced-tracker uses get_workouts() data
          const perfData = safeSerialize(firstWorkout);
          results.tests.performance_summary = {
            success: true,
            data: perfData,
            performance_summary_id: firstWorkout.performance_summary_id
          };
          console.log(`✓ Performance summary: ${perfData?.calories_burned} calories`);
        } else {
          console.log('⚠ No performance summary ID found in workout');
          results.tests.performance_summary = { success: false, error: 'No performance summary ID' };
        }
      } else {
        console.log('⚠ No workouts available for performance summary test');
        results.tests.performance_summary = { success: false, error: 'No workouts available' };
      }
    } catch (error) {
      const errorMsg = `Performance summary failed: ${error instanceof Error ? error.message : String(error)}`;
      console.log(`✗ ${errorMsg}`);
      results.tests.performance_summary = { success: false, error: errorMsg };
      results.errors.push(errorMsg);
    }
    
    // Test 5: Get Body Composition Data (last 90 days)
    try {
      console.log('📏 Testing body composition data...');
      const endDate = new Date();
      const startDate = new Date(endDate.getTime() - (90 * 24 * 60 * 60 * 1000));
      
      const bodyCompList = await otf.workouts.getBodyCompositionList();
      
      const bodyCompData = safeSerialize(bodyCompList);
      results.tests.body_composition = {
        success: true,
        data: bodyCompData,
        count: bodyCompList?.length || 0,
        date_range: {
          start: startDate.toISOString(),
          end: endDate.toISOString()
        }
      };
      console.log(`✓ Found ${bodyCompList?.length || 0} body composition records`);
    } catch (error) {
      const errorMsg = `Body composition failed: ${error instanceof Error ? error.message : String(error)}`;
      console.log(`✗ ${errorMsg}`);
      results.tests.body_composition = { success: false, error: errorMsg };
      results.errors.push(errorMsg);
    }
    
    // Test 6: Get Current Bookings
    try {
      console.log('📅 Testing current bookings...');
      // Match Python: get_bookings_new() without parameters gets all current/future bookings
      const bookings = await otf.bookings.getBookingsNew(new Date(), new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)); // 30 days future
      
      const bookingsData = safeSerialize(bookings);
      results.tests.current_bookings = {
        success: true,
        data: bookingsData,
        count: bookings?.length || 0
      };
      console.log(`✓ Found ${bookings?.length || 0} current bookings`);
    } catch (error) {
      const errorMsg = `Current bookings failed: ${error instanceof Error ? error.message : String(error)}`;
      console.log(`✗ ${errorMsg}`);
      results.tests.current_bookings = { success: false, error: errorMsg };
      results.errors.push(errorMsg);
    }
    
  } catch (error) {
    const errorMsg = `TypeScript integration test failed: ${error instanceof Error ? error.message : String(error)}`;
    console.log(`💥 ${errorMsg}`);
    results.errors.push(errorMsg);
    console.error(error);
  }
  
  return results;
}

async function main() {
  /**
   * Main entry point
   */
  console.log('🚀 Starting TypeScript OTF API Integration Tests');
  console.log('=' .repeat(60));
  
  // Load .env file if available
  loadEnvFile();
  
  // Run async tests
  const results = await runTypeScriptIntegrationTests();
  
  if (results) {
    // Write results to file
    const outputFile = join(__dirname, 'integration-test-results-typescript.json');
    writeFileSync(outputFile, JSON.stringify(results, null, 2));
    
    console.log('\n' + '='.repeat(60));
    console.log(`📄 Results written to: ${outputFile}`);
    
    // Summary
    const totalTests = Object.keys(results.tests).length;
    const successfulTests = Object.values(results.tests).filter(test => test.success).length;
    const failedTests = totalTests - successfulTests;
    
    console.log('📊 Test Summary:');
    console.log(`   Total: ${totalTests}`);
    console.log(`   Passed: ${successfulTests}`);
    console.log(`   Failed: ${failedTests}`);
    
    if (results.errors.length > 0) {
      console.log(`❌ Errors encountered: ${results.errors.length}`);
      results.errors.forEach(error => console.log(`   - ${error}`));
    }
    
    console.log('🔷 TypeScript integration tests complete!');
    
    // Exit with error code if tests failed
    process.exit(failedTests === 0 ? 0 : 1);
  } else {
    console.log('💥 Integration tests could not run');
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main().catch(error => {
    console.error('Failed to run integration tests:', error);
    process.exit(1);
  });
}

export { runTypeScriptIntegrationTests, safeSerialize };
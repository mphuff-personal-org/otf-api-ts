#!/usr/bin/env python3
"""
Python integration test script for OTF API
Fetches data from key APIs and outputs to JSON for comparison with TypeScript implementation
"""

import json
import os
import sys
import traceback
from datetime import datetime, timedelta
from pathlib import Path

from otf_api import Otf
from otf_api.auth import OtfUser


def load_env_file():
    """Load .env file from project root if it exists"""
    # Find project root (two levels up from this script)
    project_root = Path(__file__).parent.parent.parent
    env_file = project_root / '.env'
    
    if env_file.exists():
        print("📄 Loading environment from .env file")
        with open(env_file) as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith('#') and '=' in line:
                    key, value = line.split('=', 1)
                    # Remove quotes if present
                    if value.startswith('"') and value.endswith('"'):
                        value = value[1:-1]
                    elif value.startswith("'") and value.endswith("'"):
                        value = value[1:-1]
                    # Only set if not already in environment
                    if key not in os.environ:
                        os.environ[key] = value
        print(f"✓ Loaded environment variables: {', '.join([k for k, v in os.environ.items() if k.startswith('OTF_')])}")
    else:
        print("⚠️  No .env file found, using environment variables")


def safe_serialize(obj):
    """Safely serialize objects for JSON output"""
    if hasattr(obj, '__dict__'):
        # Convert objects to dictionaries
        return {k: safe_serialize(v) for k, v in obj.__dict__.items() if not k.startswith('_')}
    elif hasattr(obj, 'isoformat'):
        # Handle datetime objects
        return obj.isoformat()
    elif isinstance(obj, (list, tuple)):
        return [safe_serialize(item) for item in obj]
    elif isinstance(obj, dict):
        return {k: safe_serialize(v) for k, v in obj.items()}
    elif hasattr(obj, 'value'):
        # Handle enum objects
        return obj.value
    else:
        # Return primitive types as-is
        return obj


def run_python_integration_tests():
    """Run integration tests against Python OTF API"""
    
    # Get credentials from environment
    email = os.getenv('OTF_EMAIL')
    password = os.getenv('OTF_PASSWORD')
    
    if not email:
        print("ERROR: OTF_EMAIL environment variable required")
        return None
        
    print(f"🐍 Running Python integration tests for {email}")
    
    results = {
        'timestamp': datetime.now().isoformat(),
        'python_version': sys.version,
        'otf_api_version': '0.15.4',  # Expected version
        'tests': {},
        'errors': []
    }
    
    try:
        # Initialize OTF client - let it handle authentication automatically
        otf = Otf()
        
        print("✓ OTF client initialized")
        
        # Test 1: Get Member Details
        try:
            print("📋 Testing member details...")
            member = otf.member
            member_data = safe_serialize(member)
            results['tests']['member_detail'] = {
                'success': True,
                'data': member_data,
                'member_uuid': member_data.get('member_uuid'),
                'home_studio_uuid': member_data.get('home_studio', {}).get('studio_uuid') if isinstance(member_data.get('home_studio'), dict) else getattr(member_data.get('home_studio'), 'studio_uuid', None)
            }
            print(f"✓ Member: {member_data.get('first_name')} {member_data.get('last_name')}")
        except Exception as e:
            error_msg = f"Member details failed: {str(e)}"
            print(f"✗ {error_msg}")
            results['tests']['member_detail'] = {'success': False, 'error': error_msg}
            results['errors'].append(error_msg)
        
        # Test 2: Get Home Studio Details
        try:
            print("🏢 Testing home studio details...")
            member = otf.member
            if member and hasattr(member, 'home_studio') and member.home_studio:
                studio = member.home_studio
                studio_data = safe_serialize(studio)
                results['tests']['home_studio_detail'] = {
                    'success': True,
                    'data': studio_data,
                    'studio_uuid': getattr(studio, 'studio_uuid', None)
                }
                print(f"✓ Home Studio: {studio_data.get('name')}")
            else:
                print("⚠ No home studio found for member")
                results['tests']['home_studio_detail'] = {'success': False, 'error': 'No home studio'}
        except Exception as e:
            error_msg = f"Home studio failed: {str(e)}"
            print(f"✗ {error_msg}")
            results['tests']['home_studio_detail'] = {'success': False, 'error': error_msg}
            results['errors'].append(error_msg)
        
        # Test 3: Get Recent Workouts (last 35 days)
        try:
            print("💪 Testing recent workouts...")
            end_date = datetime.now()
            start_date = end_date - timedelta(days=35)  # Extended to 35 days to include 7/29 workout
            
            workouts = otf.workouts.get_workouts(
                start_date=start_date.date(),
                end_date=end_date.date()
            )
            
            # Filter out invalid workouts with very low calorie counts (< 100 calories indicates invalid data)
            # This matches the TypeScript filtering logic
            if workouts:
                filtered_workouts = []
                for workout in workouts:
                    calories = getattr(workout, 'calories_burned', None)
                    if calories is not None and calories < 100:
                        print(f"🚫 Filtering out invalid workout with {calories} calories")
                        continue
                    filtered_workouts.append(workout)
                limited_workouts = filtered_workouts
            else:
                limited_workouts = []
            workouts_data = safe_serialize(limited_workouts)
            results['tests']['recent_workouts'] = {
                'success': True,
                'data': workouts_data,
                'count': len(limited_workouts),
                'date_range': {
                    'start': start_date.isoformat(),
                    'end': end_date.isoformat()
                }
            }
            print(f"✓ Found {len(limited_workouts)} recent workouts (filtered from {len(workouts) if workouts else 0})")
        except Exception as e:
            error_msg = f"Recent workouts failed: {str(e)}"
            print(f"✗ {error_msg}")
            results['tests']['recent_workouts'] = {'success': False, 'error': error_msg}
            results['errors'].append(error_msg)
        
        # Test 4: Get Performance Summary (if workouts exist)
        try:
            workouts = results['tests'].get('recent_workouts', {}).get('data', [])
            if workouts and len(workouts) > 0:
                print("📊 Testing performance summary...")
                first_workout = workouts[0]
                if first_workout.get('performance_summary_id'):
                    # Note: Using the workout data itself as the performance summary
                    # since the Python API integrates this data already
                    perf_data = safe_serialize(first_workout)
                    results['tests']['performance_summary'] = {
                        'success': True,
                        'data': perf_data,
                        'performance_summary_id': first_workout.get('performance_summary_id')
                    }
                    print(f"✓ Performance summary: {perf_data.get('calories')} calories")
                else:
                    print("⚠ No performance summary ID found in workout")
                    results['tests']['performance_summary'] = {'success': False, 'error': 'No performance summary ID'}
            else:
                print("⚠ No workouts available for performance summary test")
                results['tests']['performance_summary'] = {'success': False, 'error': 'No workouts available'}
        except Exception as e:
            error_msg = f"Performance summary failed: {str(e)}"
            print(f"✗ {error_msg}")
            results['tests']['performance_summary'] = {'success': False, 'error': error_msg}
            results['errors'].append(error_msg)
        
        # Test 5: Get Body Composition Data (last 90 days)
        try:
            print("📏 Testing body composition data...")
            end_date = datetime.now()
            start_date = end_date - timedelta(days=90)
            
            body_comp_list = otf.workouts.get_body_composition_list()
            
            body_comp_data = safe_serialize(body_comp_list)
            results['tests']['body_composition'] = {
                'success': True,
                'data': body_comp_data,
                'count': len(body_comp_list) if body_comp_list else 0,
                'date_range': {
                    'start': start_date.isoformat(),
                    'end': end_date.isoformat()
                }
            }
            print(f"✓ Found {len(body_comp_list) if body_comp_list else 0} body composition records")
        except Exception as e:
            error_msg = f"Body composition failed: {str(e)}"
            print(f"✗ {error_msg}")
            results['tests']['body_composition'] = {'success': False, 'error': error_msg}
            results['errors'].append(error_msg)
        
        # Test 6: Get Current Bookings
        try:
            print("📅 Testing current bookings...")
            bookings = otf.bookings.get_bookings_new()
            
            bookings_data = safe_serialize(bookings)
            results['tests']['current_bookings'] = {
                'success': True,
                'data': bookings_data,
                'count': len(bookings) if bookings else 0
            }
            print(f"✓ Found {len(bookings) if bookings else 0} current bookings")
        except Exception as e:
            error_msg = f"Current bookings failed: {str(e)}"
            print(f"✗ {error_msg}")
            results['tests']['current_bookings'] = {'success': False, 'error': error_msg}
            results['errors'].append(error_msg)
        
    except Exception as e:
        error_msg = f"Python integration test failed: {str(e)}"
        print(f"💥 {error_msg}")
        results['errors'].append(error_msg)
        traceback.print_exc()
    
    return results


def main():
    """Main entry point"""
    
    print("🚀 Starting Python OTF API Integration Tests")
    print("=" * 60)
    
    # Load .env file if available
    load_env_file()
    
    # Run tests
    results = run_python_integration_tests()
    
    if results:
        # Write results to integration_test directory
        output_file = Path(__file__).parent.parent / 'integration-test-results-python.json'
        with open(output_file, 'w') as f:
            json.dump(results, f, indent=2, sort_keys=True)
        
        print("\n" + "=" * 60)
        print(f"📄 Results written to: {output_file}")
        
        # Summary
        total_tests = len(results['tests'])
        successful_tests = sum(1 for test in results['tests'].values() if test.get('success'))
        failed_tests = total_tests - successful_tests
        
        print(f"📊 Test Summary:")
        print(f"   Total: {total_tests}")
        print(f"   Passed: {successful_tests}")
        print(f"   Failed: {failed_tests}")
        
        if results['errors']:
            print(f"❌ Errors encountered: {len(results['errors'])}")
            for error in results['errors']:
                print(f"   - {error}")
        
        print("🐍 Python integration tests complete!")
        
        # Exit with error code if tests failed
        sys.exit(0 if failed_tests == 0 else 1)
    else:
        print("💥 Integration tests could not run")
        sys.exit(1)


if __name__ == '__main__':
    main()
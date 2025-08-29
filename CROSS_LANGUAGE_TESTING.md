# Cross-Language Integration Testing

This document describes the consolidated integration testing system that validates consistency between the Python `otf-api` package and this TypeScript implementation.

## Overview

The cross-language integration testing system:

1. **Automatically downloads** the published Python `otf-api` package (configurable version)
2. **Runs identical tests** against both Python and TypeScript implementations
3. **Validates 100% data consistency** between the two libraries
4. **Provides detailed analysis** of any differences found

## Quick Start

### Prerequisites

- Node.js and npm
- Python 3.11+
- [UV](https://docs.astral.sh/uv/) - Modern Python package manager
- OTF account credentials

#### Installing UV

```bash
# macOS/Linux
curl -LsSf https://astral.sh/uv/install.sh | sh

# or with pip
pip install uv

# or with brew
brew install uv
```

### Environment Setup

Create a `.env` file in the project root:

```bash
# Copy the example file
cp .env.example .env

# Edit with your credentials
OTF_EMAIL=your-email@example.com
OTF_PASSWORD=your-password  # Optional

# Python target version is managed in TARGET_PYTHON_OTFAPI_LIBRARY_VERSION file
# To change: npm run python-version:set 0.15.5
```

**Or** export environment variables directly:
```bash
export OTF_EMAIL="your-email@example.com"
export OTF_PASSWORD="your-password"  # Optional
```

### Run Tests

```bash
# Run the full cross-language integration test suite
npm run integration-test:cross-language

# Or use the script directly
./scripts/run-integration-tests.sh
```

## Test Architecture

### Components

1. **Python Integration Project** (`integration_test/python/`)
   - UV-managed Python project with `pyproject.toml`
   - Downloads and installs the published `otf-api` Python package
   - Runs tests against key GET APIs (`integration_test.py`)
   - Outputs results to `integration_test/integration-test-results-python.json`

2. **TypeScript Integration Script** (`integration_test/typescript/integration-test-typescript.ts`)
   - Tests the same APIs using the TypeScript implementation
   - Outputs results to `integration-test-results-typescript.json`

3. **Cross-Language Validator** (`integration_test/typescript/integration-test-validator.ts`)
   - Deep-compares Python vs TypeScript results
   - Reports differences, missing fields, type mismatches
   - Outputs detailed analysis to `integration-validation-results.json`

4. **Version Management**
   - `TARGET_PYTHON_OTFAPI_LIBRARY_VERSION` - Single source of truth for Python package version
   - `scripts/update-python-version.js` - Syncs version across project files

5. **Environment Configuration**
   - `.env` - Environment variables (OTF credentials)
   - `.env.example` - Template for environment setup

### Tested APIs

The integration tests validate these key OTF APIs:

- **Member Details** - User profile information
- **Home Studio Details** - Studio information  
- **Recent Workouts** - Last 30 days of workout data
- **Performance Summary** - Detailed workout metrics
- **Body Composition** - Body scan measurements
- **Current Bookings** - Upcoming class reservations

## Python Package Management

The system uses UV for all Python dependency management:

- **UV-based Project** - Python dependencies managed in `integration_test/python/pyproject.toml`
- **Automatic Installation** - `uv sync` installs the exact `otf-api` version specified
- **Version Management** - `TARGET_PYTHON_OTFAPI_LIBRARY_VERSION` file controls which version to test
- **No System Pollution** - UV creates isolated environments automatically

## Usage Examples

### Basic Usage
```bash
# Set credentials and run
export OTF_EMAIL="user@example.com"
export OTF_PASSWORD="password"
npm run integration-test:cross-language
```

### CI/CD Usage
```bash
# Test specific Python version
export PYTHON_VERSION="0.15.3"
export OTF_EMAIL="ci@example.com"
# Use stored credentials or token-based auth
./integration_test/run-integration-tests.sh
```

### Individual Components
```bash
# Run just Python tests (automatically installs otf-api package)
npm run integration-test:python

# Run just TypeScript tests  
npm run integration-test:typescript

# Run just validation (requires both result files)
npm run integration-test:validate
```

**Note:** All integration commands now support `.env` files for configuration. The system will:
- Automatically source `.env` file from project root if present
- Use UV for Python dependency management  
- Install the exact `otf-api` version specified in `TARGET_PYTHON_OTFAPI_LIBRARY_VERSION`
- Create isolated environments to avoid system pollution

## Output Files

After running tests, you'll find these files in the `integration_test/` directory:

- **`integration-test-results-python.json`** - Python test results
- **`integration-test-results-typescript.json`** - TypeScript test results
- **`integration-validation-results.json`** - Detailed comparison analysis

## Interpreting Results

### Success (Exit Code 0)
```
🎉 CROSS-LANGUAGE INTEGRATION TESTS PASSED
   Python (0.15.4) and TypeScript implementations produce identical results!

📊 Test Summary:
   Python: 6/6 tests passed
   TypeScript: 6/6 tests passed  
   Cross-language consistency: ✅ 100% identical
   Validation status: ✅ PASSED
```

### Failure (Exit Code 1)
```
❌ CROSS-LANGUAGE INTEGRATION TESTS FAILED
   Python and TypeScript implementations have inconsistencies

📋 Troubleshooting:
   1. Check detailed validation results: integration-validation-results.json
   2. Compare individual test results:
      - integration-test-results-python.json
      - integration-test-results-typescript.json
   3. Review test output above for specific API failures
```

## Troubleshooting

### Common Issues

1. **Authentication Failures**
   - Verify `OTF_EMAIL` is set correctly
   - Try providing `OTF_PASSWORD` if token auth fails
   - Check credentials work with OTF mobile app

2. **Python Package Installation Fails**
   - Install UV for faster installation: `pip install uv` or `curl -LsSf https://astral.sh/uv/install.sh | sh`
   - Check Python version compatibility: `python3 --version` (requires 3.11+)
   - Try manual install: `pip install --user otf-api==0.15.4`
   - Check pip permissions: Scripts automatically use `--user` flag to avoid permission issues
   - Verify PATH includes user site-packages: `python3 -m site --user-site`

3. **TypeScript Build Fails**
   - Run `npm install` to ensure dependencies
   - Check Node.js version compatibility

4. **API Differences Found**
   - Review `integration-validation-results.json` for specifics
   - Check if differences are expected (e.g., timestamp fields)
   - Verify both libraries are using same API version

### Debug Mode

For more verbose output, you can run individual components:

```bash
# Debug Python issues
python3 scripts/integration-test-python.py

# Debug TypeScript issues  
npx ts-node scripts/integration-test-typescript.ts

# Debug validation issues
npx ts-node scripts/integration-test-validator.ts
```

## Configuration

### Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `OTF_EMAIL` | ✅ | - | OTF account email |
| `OTF_PASSWORD` | ❌ | - | OTF account password |
| `PYTHON_VERSION` | ❌ | `0.15.4` | Python package version to test |

### Customization

To test different APIs or modify test behavior:

1. Edit `scripts/integration-test-python.py` 
2. Edit `scripts/integration-test-typescript.ts`
3. Ensure both scripts test identical functionality
4. Update validation logic if needed

## CI/CD Integration

Add to your CI/CD pipeline:

```yaml
# GitHub Actions example
- name: Cross-Language Integration Tests
  env:
    OTF_EMAIL: ${{ secrets.OTF_EMAIL }}
    OTF_PASSWORD: ${{ secrets.OTF_PASSWORD }}
  run: npm run integration-test:cross-language
```

The tests will fail (exit code 1) if any inconsistencies are detected, making them suitable for automated validation of releases.
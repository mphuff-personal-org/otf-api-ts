#!/bin/bash
set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
NC='\033[0m' # No Color

echo -e "${BLUE}🚀 OTF API Cross-Language Integration Test Suite${NC}"
echo "================================================="

# Change to project root
PROJECT_ROOT="$( cd "$( dirname "${BASH_SOURCE[0]}" )/.." &> /dev/null && pwd )"
cd "$PROJECT_ROOT"

# Source .env file if it exists
if [ -f ".env" ]; then
    echo -e "${GREEN}📄 Loading environment from .env file${NC}"
    set -o allexport
    source .env
    set +o allexport
else
    echo -e "${YELLOW}⚠️  No .env file found, using environment variables${NC}"
fi

# Configuration - read target version from otf-python.config.json
if [ -f "otf-python.config.json" ]; then
    PYTHON_VERSION=$(node -pe "JSON.parse(require('fs').readFileSync('otf-python.config.json', 'utf8')).version")
else
    PYTHON_VERSION="${PYTHON_VERSION:-0.15.4}"
fi
echo -e "${BLUE}Configuration:${NC}"
echo "   Python OTF API version: $PYTHON_VERSION (from otf-python.config.json)"

# Check for required environment variables
if [ -z "$OTF_EMAIL" ]; then
    echo -e "${RED}❌ ERROR: OTF_EMAIL environment variable is required${NC}"
    echo -e "${YELLOW}💡 Create a .env file in the project root with:${NC}"
    echo "   OTF_EMAIL=your-email@example.com"
    echo "   OTF_PASSWORD=your-password  # Optional"
    exit 1
fi

echo -e "${GREEN}✓ Using email: $OTF_EMAIL${NC}"

# Check if password is provided (optional for token-based auth)
if [ -z "$OTF_PASSWORD" ]; then
    echo -e "${YELLOW}⚠️  No OTF_PASSWORD provided - attempting token-based auth${NC}"
else
    echo -e "${GREEN}✓ Password provided${NC}"
fi

echo
echo -e "${BLUE}📦 Step 1: Setting up Python Environment${NC}"
echo "----------------------------------------"

# Change to python integration test directory
cd "$PROJECT_ROOT/integration_test/python"

# Check if UV is available
if ! command -v uv &> /dev/null; then
    echo -e "${RED}❌ ERROR: UV is required for Python dependency management${NC}"
    echo -e "${YELLOW}💡 Install UV with one of these commands:${NC}"
    echo "   curl -LsSf https://astral.sh/uv/install.sh | sh"
    echo "   pip install uv"
    echo "   brew install uv"
    exit 1
fi

echo -e "${PURPLE}📦 Using UV for Python dependency management${NC}"

# Update pyproject.toml with target version if needed
if [ -f "../../TARGET_PYTHON_OTFAPI_LIBRARY_VERSION" ]; then
    echo -e "${YELLOW}🔄 Syncing pyproject.toml with target version...${NC}"
    node ../../scripts/update-python-version.js "$PYTHON_VERSION"
fi

# Install dependencies using UV
echo -e "${PURPLE}📦 Installing Python dependencies with UV...${NC}"
uv sync
if [ $? -ne 0 ]; then
    echo -e "${RED}❌ Failed to install Python dependencies${NC}"
    exit 1
fi

echo -e "${GREEN}✓ Python environment ready with UV${NC}"

echo
echo -e "${BLUE}📋 Step 2: Running Python Integration Tests${NC}"
echo "--------------------------------------------"

# Run Python integration tests using UV
uv run integration_test.py
PYTHON_EXIT_CODE=$?

if [ $PYTHON_EXIT_CODE -eq 0 ]; then
    echo -e "${GREEN}✓ Python integration tests completed successfully${NC}"
else
    echo -e "${YELLOW}⚠️  Python integration tests completed with some failures (exit code: $PYTHON_EXIT_CODE)${NC}"
fi

echo
echo -e "${BLUE}🔷 Step 3: Preparing TypeScript Environment${NC}"
echo "--------------------------------------------"

# Ensure we're in the TypeScript project root
cd "$PROJECT_ROOT"

# Install TypeScript dependencies if needed
if [ ! -d "node_modules" ]; then
    echo -e "${YELLOW}📦 Installing TypeScript dependencies...${NC}"
    npm install
    if [ $? -ne 0 ]; then
        echo -e "${RED}❌ Failed to install TypeScript dependencies${NC}"
        exit 1
    fi
fi

# Build TypeScript project if needed
if [ ! -d "dist" ] || [ ! -f "dist/index.js" ]; then
    echo -e "${YELLOW}🔨 Building TypeScript project...${NC}"
    npm run build
    if [ $? -ne 0 ]; then
        echo -e "${RED}❌ Failed to build TypeScript project${NC}"
        exit 1
    fi
fi

echo -e "${GREEN}✓ TypeScript environment ready${NC}"

echo
echo -e "${BLUE}🔷 Step 4: Running TypeScript Integration Tests${NC}"
echo "-----------------------------------------------"

# Run TypeScript integration tests
cd "$PROJECT_ROOT/integration_test/typescript"
npx --yes ts-node integration-test-typescript.ts
TYPESCRIPT_EXIT_CODE=$?

if [ $TYPESCRIPT_EXIT_CODE -eq 0 ]; then
    echo -e "${GREEN}✓ TypeScript integration tests completed successfully${NC}"
else
    echo -e "${YELLOW}⚠️  TypeScript integration tests completed with some failures (exit code: $TYPESCRIPT_EXIT_CODE)${NC}"
fi

echo
echo -e "${BLUE}🔍 Step 5: Cross-Language Validation${NC}"
echo "-------------------------------------"

# Check if both result files exist
if [ ! -f "../integration-test-results-python.json" ]; then
    echo -e "${RED}❌ Python results file not found${NC}"
    echo -e "${YELLOW}   Expected: $PROJECT_ROOT/integration_test/integration-test-results-python.json${NC}"
    exit 1
fi

if [ ! -f "integration-test-results-typescript.json" ]; then
    echo -e "${RED}❌ TypeScript results file not found${NC}"
    echo -e "${YELLOW}   Expected: $PROJECT_ROOT/integration_test/typescript/integration-test-results-typescript.json${NC}"
    exit 1
fi

echo -e "${GREEN}✓ Both result files found${NC}"

# Run validation
echo -e "${YELLOW}🔍 Comparing Python vs TypeScript results...${NC}"
npx --yes ts-node integration-test-validator.ts
VALIDATION_EXIT_CODE=$?

echo
echo "================================================="
if [ $VALIDATION_EXIT_CODE -eq 0 ]; then
    echo -e "${GREEN}🎉 CROSS-LANGUAGE INTEGRATION TESTS PASSED${NC}"
    echo -e "${GREEN}   Python ($PYTHON_VERSION) and TypeScript implementations produce identical results!${NC}"
    
    # Show detailed summary
    echo
    echo -e "${BLUE}📊 Test Summary:${NC}"
    if command -v jq &> /dev/null; then
        PYTHON_TESTS=$(cat ../integration-test-results-python.json | jq -r '.tests | length')
        TYPESCRIPT_TESTS=$(cat integration-test-results-typescript.json | jq -r '.tests | length')
        PYTHON_SUCCESS=$(cat ../integration-test-results-python.json | jq -r '[.tests[] | select(.success == true)] | length')
        TYPESCRIPT_SUCCESS=$(cat integration-test-results-typescript.json | jq -r '[.tests[] | select(.success == true)] | length')
        
        echo "   Python: $PYTHON_SUCCESS/$PYTHON_TESTS tests passed"
        echo "   TypeScript: $TYPESCRIPT_SUCCESS/$TYPESCRIPT_TESTS tests passed"
        echo "   Cross-language consistency: ✅ 100% identical"
        echo "   Validation status: ✅ PASSED"
    else
        echo "   Results available in JSON files (install jq for detailed summary)"
        echo "   Cross-language consistency: ✅ PASSED"
    fi
    
    echo
    echo -e "${BLUE}📁 Generated Files:${NC}"
    echo "   integration_test/integration-test-results-python.json"
    echo "   integration_test/typescript/integration-test-results-typescript.json" 
    echo "   integration_test/typescript/integration-validation-results.json"
    
    exit 0
else
    echo -e "${RED}❌ CROSS-LANGUAGE INTEGRATION TESTS FAILED${NC}"
    echo -e "${RED}   Python and TypeScript implementations have inconsistencies${NC}"
    
    echo
    echo -e "${YELLOW}📋 Troubleshooting:${NC}"
    echo "   1. Check detailed validation results: integration_test/typescript/integration-validation-results.json"
    echo "   2. Compare individual test results:"
    echo "      - integration_test/integration-test-results-python.json"
    echo "      - integration_test/typescript/integration-test-results-typescript.json"
    echo "   3. Review test output above for specific API failures"
    
    echo
    echo -e "${BLUE}📊 Test Summary:${NC}"
    if command -v jq &> /dev/null; then
        PYTHON_TESTS=$(cat ../integration-test-results-python.json 2>/dev/null | jq -r '.tests | length' || echo "unknown")
        TYPESCRIPT_TESTS=$(cat integration-test-results-typescript.json 2>/dev/null | jq -r '.tests | length' || echo "unknown")
        echo "   Python tests: $PYTHON_TESTS"
        echo "   TypeScript tests: $TYPESCRIPT_TESTS" 
        echo "   Cross-language consistency: ❌ FAILED"
    fi
    
    exit 1
fi
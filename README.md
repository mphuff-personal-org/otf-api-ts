# OTF API - TypeScript Library

[![npm version](https://badge.fury.io/js/otf-api-ts.svg)](https://badge.fury.io/js/otf-api-ts)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-blue.svg)](https://www.typescriptlang.org/)
[![Node.js 18+](https://img.shields.io/badge/node-18.0+-green.svg)](https://nodejs.org/)
[![Code Coverage](https://codecov.io/gh/mphuff-personal-org/otf-api-ts/branch/master/graph/badge.svg)](https://codecov.io/gh/mphuff-personal-org/otf-api-ts)

Type-safe TypeScript/JavaScript client for OrangeTheory Fitness APIs with full coverage of workouts, bookings, studios, and member data.

**⚠️ Disclaimer**: Not affiliated with Orangetheory Fitness. May break if their API changes.

## Important: Python Library Relationship

This TypeScript library follows the [Python otf-api](https://github.com/NodeJSmith/otf-api) library:
- **Version Alignment**: The version number matches the Python library base version (see `otf-python.config.json`)
- **Source of Truth**: The Python library is the canonical source - all API changes should originate there
- **Porting Direction**: Changes flow from Python → TypeScript, never the reverse (except TypeScript-specific fixes)
- **Type Generation**: All types are auto-generated from Python Pydantic models

## Installation

```bash
npm install otf-api-ts
```

## Quick Start

```typescript
import { Otf } from 'otf-api-ts';

// Initialize with credentials or use env vars (OTF_EMAIL, OTF_PASSWORD)
const otf = new Otf({
  email: 'your-email@example.com',
  password: 'your-password'
});

// Get member details
const member = await otf.members.getMemberDetail();
console.log(`Hello, ${member.first_name}!`);

// Get workouts
const workouts = await otf.workouts.getWorkouts({
  startDate: new Date('2024-01-01'),
  endDate: new Date('2024-01-31')
});
```

## API Modules

### Members API
```typescript
const member = await otf.members.getMemberDetail();
```

### Workouts API
```typescript
const performance = await otf.workouts.getPerformanceSummary('summary-id');
const telemetry = await otf.workouts.getTelemetry('summary-id');
const challenges = await otf.workouts.getChallengeTracker();
```

### Bookings API
```typescript
const bookings = await otf.bookings.getBookingsNew(startDate, endDate);
const booking = await otf.bookings.getBookingNew('booking-id');
```

### Studios API
```typescript
const studio = await otf.studios.getStudioDetail('studio-uuid');
const services = await otf.studios.getStudioServices('studio-uuid');
```

## Configuration

```typescript
const otf = new Otf({
  email: 'your-email@example.com',
  password: 'your-password',
  
  // Optional settings
  cache: new MemoryCache({ maxSize: 1000 }),  // or LocalStorageCache, FileCache
  timeout: 30000,                              // Request timeout in ms
  debug: true                                  // Enable debug logging
});
```

## Caching

Three cache implementations available:
- **MemoryCache** (default): In-memory caching
- **LocalStorageCache**: Browser localStorage
- **FileCache**: Node.js file system

```typescript
// Browser
import { LocalStorageCache } from 'otf-api-ts';
const otf = new Otf({ cache: new LocalStorageCache() });

// Node.js persistent cache
import { FileCache } from 'otf-api-ts';
const otf = new Otf({ cache: new FileCache({ cacheDir: './cache' }) });
```

## Type Safety

Full TypeScript support with generated types from Python Pydantic models:

```typescript
import type { MemberDetail, BookingV2, Workout } from 'otf-api-ts';

const member: MemberDetail = await otf.members.getMemberDetail();
const homeStudio = member.home_studio;  // Fully typed nested objects
const weight = member.weight;           // Properly typed as number | null
```

## Development

### Versioning Strategy

This library uses a compressed versioning scheme to track the Python otf-api library while maintaining npm semver compatibility:

**Version Format: `0.[PYTHON_MINOR][PYTHON_PATCH].[TS_PATCH]`**

Examples:
- Python `0.15.4` → TypeScript `0.154.0`, `0.154.1`, `0.154.2`...
- Python `0.15.10` → TypeScript `0.1510.0`, `0.1510.1`...
- Python `0.16.0` → TypeScript `0.160.0`, `0.160.1`...

**Key Points:**
- Python version tracked in `otf-python.config.json`
- Middle digit combines Python minor+patch (15+4 = 154)
- Last digit for TypeScript-specific patches
- To update Python version: `npm run python-version:set <version>`
- For local development, copy `otf-python.config.local.example.json` to `otf-python.config.local.json`

### Requirements
- Node.js 18+
- npm/yarn/pnpm

### Setup
```bash
git clone https://github.com/your-username/otf-api-ts.git
cd otf-api-ts
npm install
```

### Available Scripts
```bash
# Core commands
npm run build              # Build TypeScript
npm run test              # Run tests
npm run test:coverage     # Run tests with coverage
npm run lint              # Lint code
npm run type-check        # Type check without building

# Development
npm run dev               # Build in watch mode
npm run test:watch        # Test in watch mode

# Schema & Types
npm run generate-types    # Generate types from OpenAPI schema
npm run validate-schema   # Validate OpenAPI schema

# Integration Testing
npm run integration-test  # Run cross-language integration tests
```

### Project Structure
```
src/
├── api/              # API client modules (bookings, members, studios, workouts)
├── auth/             # AWS Cognito authentication
├── cache/            # Cache implementations  
├── client/           # HTTP client
├── generated/        # Auto-generated types from Python models
└── types/            # Custom TypeScript types

test/                 # Test suite
examples/            # Usage examples
scripts/             # Build and utility scripts
```

## Architecture Notes

- **Type Generation**: Types are auto-generated from Python Pydantic models to maintain consistency
- **Field Mapping**: Library handles OrangeTheory's inconsistent API field names internally
- **Authentication**: AWS Cognito with automatic token refresh

## Cross-Platform Integration Testing

The library includes comprehensive cross-language validation to ensure data consistency:

```bash
# Run full cross-language integration tests
npm run integration-test

# Run Python integration tests
npm run integration-test:python

# Run TypeScript integration tests  
npm run integration-test:typescript

# Validate data consistency between Python and TypeScript
npm run integration-test:validate
```

**What's Tested:**
- API response parsing matches between Python and TypeScript
- Data transformation produces identical results
- Field mapping consistency
- Authentication flow parity
- Cache behavior alignment

The integration tests fetch real data using both libraries and validate that the outputs are identical, ensuring complete compatibility.

## Error Handling

```typescript
import { OtfError, AuthenticationError, RateLimitError } from 'otf-api-ts';

try {
  const member = await otf.members.getMemberDetail();
} catch (error) {
  if (error instanceof AuthenticationError) {
    // Handle auth failure
  } else if (error instanceof RateLimitError) {
    // Handle rate limiting  
  }
}
```

## Troubleshooting

**Authentication Issues**
```typescript
const otf = new Otf({ debug: true });  // Enable debug logging
```

**CORS Issues (Browser)**
```typescript
// Use a CORS proxy for development
const otf = new Otf({
  baseUrl: 'https://cors-proxy.example.com/https://api.orangetheory.co'
});
```

**Rate Limiting**
```typescript
// Add delays between requests
await new Promise(resolve => setTimeout(resolve, 500));
```

## Contributing

**Important: Python-First Development**
- All API changes MUST originate in the [Python otf-api](https://github.com/NodeJSmith/otf-api) library
- Do NOT port TypeScript changes back to Python (except TypeScript-specific fixes)
- The Python library is the canonical source of truth

**Development Workflow:**
1. Make changes in Python otf-api first
2. Update version in `otf-python.config.json` (or use `npm run python-version:set`)
3. Run `npm run generate-types` to sync TypeScript types
4. Run `npm run integration-test:validate` to ensure consistency
5. Add TypeScript-specific tests if needed
6. Ensure `npm run lint` and `npm run type-check` pass
7. Maintain 80%+ test coverage

## License

MIT

## Links

- [NPM Package](https://www.npmjs.com/package/otf-api-ts)
- [GitHub Repository](https://github.com/your-username/otf-api-ts)
- [Coverage Reports](https://codecov.io/gh/mphuff-personal-org/otf-api-ts)
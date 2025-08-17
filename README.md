# OTF API TypeScript

TypeScript client library for OrangeTheory Fitness API, designed for use with Supabase and other serverless environments.

## Installation

```bash
npm install otf-api-ts
# or
yarn add otf-api-ts
```

## Quick Start

```typescript
import { Otf } from 'otf-api-ts';

const otf = new Otf({
  email: 'your-email@example.com',
  password: 'your-password',
});

await otf.initialize();

// Get member details
const member = await otf.member;
console.log(`Hello ${member.first_name}!`);
```

## Environment Variables

Set `OTF_EMAIL` and `OTF_PASSWORD` to avoid passing credentials in code:

```typescript
// No credentials needed if environment variables are set
const otf = new Otf();
await otf.initialize();
```

## Supabase Edge Functions

This library is optimized for Supabase Edge Functions:

```typescript
import { Otf } from 'otf-api-ts';

Deno.serve(async (req) => {
  const otf = new Otf({
    email: Deno.env.get('OTF_EMAIL')!,
    password: Deno.env.get('OTF_PASSWORD')!,
  });
  
  await otf.initialize();
  const member = await otf.member;
  
  return new Response(JSON.stringify(member));
});
```

## Current Status

🚧 **In Development** - This is a proof of concept implementation.

**Implemented:**
- ✅ Project structure and build system
- ✅ Authentication framework (AWS Cognito)
- ✅ HTTP client with retry logic
- ✅ Multi-environment caching (memory, localStorage, file)
- ✅ Error handling hierarchy
- ✅ Members API (basic functionality)

**TODO:**
- ⚠️ Complete SRP authentication implementation
- ⚠️ AWS SigV4 signing for specific endpoints
- 📝 Bookings API
- 📝 Studios API  
- 📝 Workouts API
- 📝 Comprehensive testing

## Architecture

- **Models**: Shared OpenAPI schema in separate package
- **Client**: HTTP client with automatic retries and error mapping
- **Auth**: AWS Cognito with JWT token management
- **Cache**: Multi-environment caching (browser/Node.js/edge)
- **APIs**: Domain-specific API classes matching Python implementation
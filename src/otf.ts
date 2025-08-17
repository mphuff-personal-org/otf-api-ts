import { Member } from 'otf-api-models';
import { OtfHttpClient } from './client/http-client';
import { OtfCognito, CognitoConfig } from './auth/cognito';
import { MembersApi } from './api/members';
import { WorkoutsApi } from './api/workouts';
import { BookingsApi } from './api/bookings';
import { MemoryCache } from './cache/memory-cache';
import { LocalStorageCache } from './cache/local-storage-cache';
import { FileCache } from './cache/file-cache';
import { Cache } from './cache/types';
import { OtfConfig, DEFAULT_CONFIG } from './types/config';
import { NoCredentialsError } from './errors';

const COGNITO_CONFIG: CognitoConfig = {
  userPoolId: 'us-east-1_dYDxUeyL1',
  clientId: '1457d19r0pcjgmp5agooi0rb1b',
  identityPoolId: 'us-east-1:4943c880-fb02-4fd7-bc37-2f4c32ecb2a3',
  region: 'us-east-1',
};

export interface OtfUser {
  email: string;
  password?: string;
}

export class Otf {
  public members: MembersApi;
  public workouts: WorkoutsApi;
  public bookings: BookingsApi;
  // TODO: Add other domain APIs
  // public studios: StudiosApi;

  private client: OtfHttpClient;
  private cognito: OtfCognito;
  private cache: Cache;
  private _member: Member | null = null;

  constructor(user?: OtfUser, config: Partial<OtfConfig> = {}) {
    const finalConfig = { ...DEFAULT_CONFIG, ...config };
    
    // Get credentials from user, environment, or config
    const email = user?.email || finalConfig.email || process.env.OTF_EMAIL;
    const password = user?.password || finalConfig.password || process.env.OTF_PASSWORD;
    
    if (!email) {
      throw new NoCredentialsError('Email is required for authentication');
    }

    // Initialize cache based on environment
    this.cache = this.createCache(finalConfig);
    
    // Initialize authentication
    this.cognito = new OtfCognito(email, password || null, this.cache, COGNITO_CONFIG);
    
    // Initialize HTTP client
    this.client = new OtfHttpClient(this.cognito, {
      maxRetries: finalConfig.maxRetries,
      baseDelay: 1000,
      maxDelay: 10000,
    }, finalConfig.timeout);

    // Initialize API modules (will be re-initialized after auth)
    this.members = new MembersApi(this.client, '');
    this.workouts = new WorkoutsApi(this.client, '');
    this.bookings = new BookingsApi(this.client, '');
  }

  async initialize(): Promise<void> {
    await this.cognito.authenticate();
    
    // Re-initialize API modules with member UUID after authentication
    const memberUuid = this.cognito.getMemberUuid();
    this.members = new MembersApi(this.client, memberUuid);
    this.workouts = new WorkoutsApi(this.client, memberUuid);
    this.bookings = new BookingsApi(this.client, memberUuid);
    
    // Set cross-references for complex operations
    this.workouts.setOtfInstance(this);
  }

  get member(): Promise<Member> {
    return this.getMember();
  }

  async getMember(): Promise<Member> {
    if (!this._member) {
      this._member = await this.members.getMemberDetail();
    }
    return this._member;
  }

  async refreshMember(): Promise<Member> {
    this._member = await this.members.getMemberDetail();
    return this._member;
  }

  get memberUuid(): Promise<string> {
    return this.getMember().then(member => member.member_uuid);
  }

  get homeStudio(): Promise<any> {
    return this.getMember().then(member => member.home_studio);
  }

  get homeStudioUuid(): Promise<string> {
    return this.homeStudio.then(studio => studio.studio_uuid);
  }

  private createCache(config: OtfConfig): Cache {
    // Browser environment
    if (typeof window !== 'undefined') {
      try {
        return new LocalStorageCache('otf-api-');
      } catch {
        return new MemoryCache();
      }
    }
    
    // Node.js environment
    if (typeof process !== 'undefined') {
      return new FileCache(config.cacheDir);
    }
    
    // Fallback to memory cache
    return new MemoryCache();
  }
}
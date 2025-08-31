import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WorkoutsApi } from '../../src/api/workouts';
import { OtfHttpClient } from '../../src/client/http-client';

describe('WorkoutsApi', () => {
  let workoutsApi: WorkoutsApi;
  let mockClient: vi.Mocked<OtfHttpClient>;

  beforeEach(() => {
    mockClient = {
      workoutRequest: vi.fn(),
    } as any;

    workoutsApi = new WorkoutsApi(mockClient, 'test-member-uuid');
  });

  describe('getPerformanceSummary', () => {
    it('should fetch performance summary by ID', async () => {
      const mockResponse = {
        data: {
          performanceSummaryId: 'test-summary-id',
          calories: 500,
          splats: 15,
          activeTime: 2700, // 45 minutes in seconds
          zoneTime: {
            gray: 5,
            blue: 10,
            green: 15,
            orange: 12,
            red: 3
          }
        }
      };

      mockClient.workoutRequest.mockResolvedValue(mockResponse);

      const result = await workoutsApi.getPerformanceSummary('test-summary-id');

      expect(result).toEqual(expect.objectContaining({
        performance_summary_id: 'test-summary-id',
        calories_burned: expect.any(Number),
        splat_points: expect.any(Number),
        active_time_seconds: expect.any(Number),
        zone_time_minutes: expect.any(Object)
      }));
    });
  });

  describe('getTelemetry', () => {
    it('should fetch telemetry data with max data points', async () => {
      const mockResponse = {
        classHistoryUuid: 'test-summary-id',
        classStartTime: '2024-01-01T10:00:00Z',
        maxHr: 190,
        memberUuid: 'test-member-uuid',
        windowSize: 24,
        zones: {
          gray: { startBpm: 96, endBpm: 116 },
          blue: { startBpm: 117, endBpm: 135 }
        },
        telemetry: [
          {
            hr: 150,
            aggCalories: 10,
            aggSplats: 1,
            relativeTimestamp: 0
          }
        ]
      };

      mockClient.workoutRequest.mockResolvedValue(mockResponse);

      const result = await workoutsApi.getTelemetry('test-summary-id', 100);

      expect(result).toEqual(expect.objectContaining({
        class_history_uuid: 'test-summary-id',
        class_start_time: '2024-01-01T10:00:00+00:00',
        max_hr: 190,
        member_uuid: 'test-member-uuid',
        performance_summary_id: 'test-summary-id',
        window_size: 24,
        zones: {
          gray: { start_bpm: 96, end_bpm: 116 },
          blue: { start_bpm: 117, end_bpm: 135 }
        },
        telemetry: expect.arrayContaining([
          expect.objectContaining({
            hr: 150,
            agg_calories: 10,
            agg_splats: 1,
            relative_timestamp: 0
          })
        ])
      }));

      expect(mockClient.workoutRequest).toHaveBeenCalledWith({
        method: 'GET',
        apiType: 'telemetry',
        path: '/v1/performance/summary',
        params: { 
          classHistoryUuid: 'test-summary-id',
          maxDataPoints: 100 
        }
      });
    });
  });

  describe('getOutOfStudioWorkouts', () => {
    it('should fetch out-of-studio workouts with date range', async () => {
      const mockResponse = {
        data: [
          {
            id: 'oos-workout-1',
            createdAt: '2024-01-01T10:00:00Z',
            workoutType: 'Running',
            durationMinutes: 30,
            calories: 300
          }
        ]
      };

      mockClient.workoutRequest.mockResolvedValue(mockResponse);

      const startDate = new Date('2024-01-01');
      const endDate = new Date('2024-01-31');
      
      const result = await workoutsApi.getOutOfStudioWorkouts(startDate, endDate);

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('oos-workout-1');
      expect(result[0].workout_type).toBe('Running');
    });
  });

  describe('getEquipmentData', () => {
    it('should fetch equipment statistics', async () => {
      const mockResponse = {
        data: {
          treadmill: {
            totalDistance: 100.5,
            avgPace: '7:30',
            maxSpeed: 12.0
          },
          rower: {
            totalDistance: 5000,
            avgPace: '2:15',
            maxWatts: 350
          }
        }
      };

      mockClient.workoutRequest.mockResolvedValue(mockResponse);

      const result = await workoutsApi.getEquipmentData('TREADMILL', 'thisYear');

      expect(result).toBeDefined();
      expect(mockClient.workoutRequest).toHaveBeenCalledWith({
        method: 'GET',
        apiType: 'performance',
        path: '/member/test-member-uuid/stats',
        params: {
          equipmentType: 'TREADMILL',
          timeframe: 'thisYear'
        }
      });
    });
  });

  describe('enhanceHeartRateWithTelemetry (maxHr business logic)', () => {
    it('should enhance heart rate with maxHr from telemetry when missing', () => {
      const heartRate = {
        max_hr: 0, // Dummy value, should be overridden
        peak_hr: 185,
        peak_hr_percent: 95,
        avg_hr: 150,
        avg_hr_percent: 75
      };

      const telemetry = {
        memberUuid: 'member123',
        classHistoryUuid: 'perf123',
        maxHr: 195, // This should populate heart_rate.max_hr
        telemetry: []
      };

      // Access the private method using bracket notation for testing
      const result = (workoutsApi as any).enhanceHeartRateWithTelemetry(heartRate, telemetry);

      expect(result.max_hr).toBe(195); // Should be populated from telemetry.maxHr
      expect(result.peak_hr).toBe(185); // Should remain unchanged
      expect(result.avg_hr).toBe(150); // Should remain unchanged
      expect(result.avg_hr_percent).toBe(75); // Should remain unchanged
    });

    it('should return unchanged heart_rate when no telemetry is provided', () => {
      const heartRate = {
        max_hr: 180, // Already has max_hr
        peak_hr: 185,
        peak_hr_percent: 95,
        avg_hr: 150,
        avg_hr_percent: 75
      };

      // No telemetry provided
      const result = (workoutsApi as any).enhanceHeartRateWithTelemetry(heartRate, null);

      expect(result.max_hr).toBe(180); // Should remain original value
      expect(result.peak_hr).toBe(185);
      expect(result.avg_hr).toBe(150);
      expect(result.avg_hr_percent).toBe(75);
    });

    it('should return unchanged heart_rate when telemetry exists but has no maxHr', () => {
      const heartRate = {
        peak_hr: 185,
        peak_hr_percent: 95,
        avg_hr: 150,
        avg_hr_percent: 75
      };

      const telemetry = {
        memberUuid: 'member123',
        classHistoryUuid: 'perf123',
        telemetry: [],
        zones: {}
        // Note: maxHr is missing
      };

      const result = (workoutsApi as any).enhanceHeartRateWithTelemetry(heartRate, telemetry);

      // Should remain unchanged (no max_hr added)
      expect(result.max_hr).toBeUndefined();
      expect(result.peak_hr).toBe(185);
      expect(result.avg_hr).toBe(150);
      expect(result.avg_hr_percent).toBe(75);
    });

    it('should override existing max_hr with telemetry maxHr value', () => {
      const heartRate = {
        max_hr: 175, // This should be overridden
        peak_hr: 185,
        peak_hr_percent: 95,
        avg_hr: 150,
        avg_hr_percent: 75
      };

      const telemetry = {
        memberUuid: 'member123',
        classHistoryUuid: 'perf123',
        maxHr: 195, // This should override the existing max_hr of 175
        telemetry: []
      };

      const result = (workoutsApi as any).enhanceHeartRateWithTelemetry(heartRate, telemetry);

      expect(result.max_hr).toBe(195); // Should be overridden from telemetry.maxHr
      expect(result.peak_hr).toBe(185); // Should remain unchanged
      expect(result.avg_hr).toBe(150); // Should remain unchanged
      expect(result.avg_hr_percent).toBe(75); // Should remain unchanged
    });

    it('should return null/undefined when heart_rate is null/undefined', () => {
      const telemetry = {
        memberUuid: 'member123',
        classHistoryUuid: 'perf123',
        maxHr: 195,
        telemetry: []
      };

      const resultNull = (workoutsApi as any).enhanceHeartRateWithTelemetry(null, telemetry);
      const resultUndefined = (workoutsApi as any).enhanceHeartRateWithTelemetry(undefined, telemetry);

      expect(resultNull).toBeNull();
      expect(resultUndefined).toBeUndefined();
    });
  });

  describe('enhanceTelemetryWithTimestamps (Python parity logic)', () => {
    it('should calculate absolute timestamps from relative timestamps and class start time', () => {
      const telemetry = {
        memberUuid: 'member123',
        classHistoryUuid: 'perf123',
        maxHr: 195,
        telemetry: [
          { relative_timestamp: 0, hr: 120, agg_splats: 0, agg_calories: 5 },
          { relative_timestamp: 60, hr: 140, agg_splats: 2, agg_calories: 15 }, // 1 minute later
          { relative_timestamp: 300, hr: 165, agg_splats: 8, agg_calories: 45 }, // 5 minutes later
        ]
      };

      const classStartTime = '2024-01-15T10:00:00+00:00';

      // Access the private method using bracket notation for testing
      const result = (workoutsApi as any).enhanceTelemetryWithTimestamps(telemetry, classStartTime);

      expect(result.telemetry).toHaveLength(3);
      
      // Check that timestamps are calculated correctly
      expect(result.telemetry[0].timestamp).toBe('2024-01-15T10:00:00+00:00'); // class start + 0 seconds
      expect(result.telemetry[1].timestamp).toBe('2024-01-15T10:01:00+00:00'); // class start + 60 seconds
      expect(result.telemetry[2].timestamp).toBe('2024-01-15T10:05:00+00:00'); // class start + 300 seconds
      
      // Verify other data is preserved
      expect(result.telemetry[0].hr).toBe(120);
      expect(result.telemetry[1].hr).toBe(140);
      expect(result.telemetry[2].hr).toBe(165);
      
      // Verify relative timestamps are preserved
      expect(result.telemetry[0].relative_timestamp).toBe(0);
      expect(result.telemetry[1].relative_timestamp).toBe(60);
      expect(result.telemetry[2].relative_timestamp).toBe(300);
    });

    it('should return unchanged telemetry when no class start time provided', () => {
      const telemetry = {
        memberUuid: 'member123',
        classHistoryUuid: 'perf123',
        maxHr: 195,
        telemetry: [
          { relative_timestamp: 60, hr: 140, agg_splats: 2, agg_calories: 15 }
        ]
      };

      const result = (workoutsApi as any).enhanceTelemetryWithTimestamps(telemetry, undefined);

      expect(result).toBe(telemetry); // Should return unchanged
      expect(result.telemetry[0]).not.toHaveProperty('timestamp');
    });

    it('should return unchanged telemetry when no telemetry array provided', () => {
      const telemetry = {
        memberUuid: 'member123',
        classHistoryUuid: 'perf123',
        maxHr: 195
        // No telemetry array
      };

      const classStartTime = '2024-01-15T10:00:00+00:00';
      const result = (workoutsApi as any).enhanceTelemetryWithTimestamps(telemetry, classStartTime);

      expect(result).toBe(telemetry); // Should return unchanged
    });

    it('should handle telemetry items without relative_timestamp', () => {
      const telemetry = {
        memberUuid: 'member123',
        classHistoryUuid: 'perf123',
        maxHr: 195,
        telemetry: [
          { relative_timestamp: 60, hr: 140, agg_splats: 2, agg_calories: 15 },
          { hr: 150, agg_splats: 5, agg_calories: 25 } // Missing relative_timestamp
        ]
      };

      const classStartTime = '2024-01-15T10:00:00+00:00';
      const result = (workoutsApi as any).enhanceTelemetryWithTimestamps(telemetry, classStartTime);

      expect(result.telemetry).toHaveLength(2);
      expect(result.telemetry[0].timestamp).toBe('2024-01-15T10:01:00+00:00');
      expect(result.telemetry[1]).not.toHaveProperty('timestamp'); // Should not have timestamp
      expect(result.telemetry[1].hr).toBe(150); // Other data preserved
    });

    it('should return null/undefined when telemetry is null/undefined', () => {
      const classStartTime = '2024-01-15T10:00:00+00:00';

      const resultNull = (workoutsApi as any).enhanceTelemetryWithTimestamps(null, classStartTime);
      const resultUndefined = (workoutsApi as any).enhanceTelemetryWithTimestamps(undefined, classStartTime);

      expect(resultNull).toBeNull();
      expect(resultUndefined).toBeUndefined();
    });
  });

  describe('calculateClassEndTime (Python parity logic)', () => {
    it('should calculate end time correctly for ORANGE_60 classes', () => {
      const startTime = '2024-01-15T10:00:00+00:00';
      
      const result = (workoutsApi as any).calculateClassEndTime(startTime, 'ORANGE_60');
      
      expect(result).toBe('2024-01-15T11:00:00+00:00'); // 60 minutes later
    });

    it('should calculate end time correctly for ORANGE_90 classes', () => {
      const startTime = '2024-01-15T10:00:00+00:00';
      
      const result = (workoutsApi as any).calculateClassEndTime(startTime, 'ORANGE_90');
      
      expect(result).toBe('2024-01-15T11:30:00+00:00'); // 90 minutes later
    });

    it('should calculate end time correctly for STRENGTH_50 classes', () => {
      const startTime = '2024-01-15T10:00:00+00:00';
      
      const result = (workoutsApi as any).calculateClassEndTime(startTime, 'STRENGTH_50');
      
      expect(result).toBe('2024-01-15T10:50:00+00:00'); // 50 minutes later
    });

    it('should calculate end time correctly for TREAD_50 classes', () => {
      const startTime = '2024-01-15T10:00:00+00:00';
      
      const result = (workoutsApi as any).calculateClassEndTime(startTime, 'TREAD_50');
      
      expect(result).toBe('2024-01-15T10:50:00+00:00'); // 50 minutes later
    });

    it('should default to 60 minutes for OTHER class type with warning', () => {
      const startTime = '2024-01-15T10:00:00+00:00';
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      
      const result = (workoutsApi as any).calculateClassEndTime(startTime, 'OTHER');
      
      expect(result).toBe('2024-01-15T11:00:00+00:00'); // 60 minutes later (default)
      expect(consoleSpy).toHaveBeenCalledWith('Class type OTHER does not have defined length, returning start time plus 60 minutes');
      
      consoleSpy.mockRestore();
    });

    it('should default to 60 minutes for unrecognized class type with warning', () => {
      const startTime = '2024-01-15T10:00:00+00:00';
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      
      const result = (workoutsApi as any).calculateClassEndTime(startTime, 'UNKNOWN_TYPE');
      
      expect(result).toBe('2024-01-15T11:00:00+00:00'); // 60 minutes later (default)
      expect(consoleSpy).toHaveBeenCalledWith('Class type UNKNOWN_TYPE is not recognized, returning start time plus 60 minutes');
      
      consoleSpy.mockRestore();
    });

    it('should handle different time zones correctly', () => {
      const startTime = '2024-01-15T15:30:00+00:00'; // 3:30 PM UTC
      
      const result = (workoutsApi as any).calculateClassEndTime(startTime, 'ORANGE_60');
      
      expect(result).toBe('2024-01-15T16:30:00+00:00'); // 4:30 PM UTC
    });

    it('should handle date boundary correctly', () => {
      const startTime = '2024-01-15T23:30:00+00:00'; // 11:30 PM UTC
      
      const result = (workoutsApi as any).calculateClassEndTime(startTime, 'ORANGE_90');
      
      expect(result).toBe('2024-01-16T01:00:00+00:00'); // 1:00 AM next day UTC
    });
  });
});
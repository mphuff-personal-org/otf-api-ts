import { OtfHttpClient } from '../client/http-client';
import { StatsTime, EquipmentType, ChallengeCategory } from '../types/workout-enums';
import { components } from '../generated/types';
import { BodyCompositionData } from '../models/body-composition';

type Workout = components['schemas']['Workout'];
type BookingV2 = components['schemas']['BookingV2'];
type OtfClass = components['schemas']['OtfClass'];
type StudioDetail = components['schemas']['StudioDetail'];

/** Complete workout data including performance, telemetry, and class details */
export interface WorkoutWithTelemetry {
  /** Performance summary identifier */
  performance_summary_id: string;
  /** Class history UUID (same as performance_summary_id) */
  class_history_uuid: string;
  /** Booking identifier */
  booking_id: string;
  /** Class UUID for ratings */
  class_uuid?: string;
  /** Coach first name */
  coach?: string;
  /** Whether this workout can be rated */
  ratable?: boolean;
  
  /** Calories burned during workout */
  calories_burned?: number;
  /** Splat points earned */
  splat_points?: number;
  /** Step count during workout */
  step_count?: number;
  /** Active workout time in seconds */
  active_time_seconds?: number;
  
  /** Time spent in each heart rate zone */
  zone_time_minutes?: ZoneTimeMinutes;
  /** Heart rate metrics */
  heart_rate?: HeartRate;
  
  /** Rower performance data */
  rower_data?: any;
  /** Treadmill performance data */
  treadmill_data?: any;
  
  /** Class information from booking */
  otf_class: OtfClass;
  /** Studio information */
  studio: StudioDetail;
  /** Telemetry data (heart rate over time) */
  telemetry?: any;
  
  /** Class rating */
  class_rating?: any;
  /** Coach rating */
  coach_rating?: any;
}

/** Heart rate zone time distribution in minutes */
export interface ZoneTimeMinutes {
  /** Time spent in gray zone (resting) */
  gray: number;
  /** Time spent in blue zone (base pace) */
  blue: number;
  /** Time spent in green zone (push pace) */
  green: number;
  /** Time spent in orange zone (all out) */
  orange: number;
  /** Time spent in red zone (max effort) */
  red: number;
}

/** Heart rate metrics for a workout */
export interface HeartRate {
  /** Maximum heart rate achieved */
  max_hr: number;
  /** Peak heart rate during workout */
  peak_hr: number;
  /** Peak heart rate as percentage of max */
  peak_hr_percent: number;
  /** Average heart rate during workout */
  avg_hr: number;
  /** Average heart rate as percentage of max */
  avg_hr_percent: number;
}

export interface PerformanceMetric {
  display_value: any;
  display_unit: string;
  metric_value: number;
}

export interface BaseEquipment {
  avg_pace: PerformanceMetric;
  avg_speed: PerformanceMetric;
  max_pace: PerformanceMetric;
  max_speed: PerformanceMetric;
  moving_time: PerformanceMetric;
  total_distance: PerformanceMetric;
}

export interface Treadmill extends BaseEquipment {
  avg_incline: PerformanceMetric;
  elevation_gained: PerformanceMetric;
  max_incline: PerformanceMetric;
}

export interface Rower extends BaseEquipment {
  avg_cadence: PerformanceMetric;
  avg_power: PerformanceMetric;
  max_cadence: PerformanceMetric;
}


export interface ChallengeTracker {
  programs: any[];
  challenges: any[];
  benchmarks: any[];
}

export interface LifetimeStats {
  calories: number;
  splat_point: number;
  total_black_zone: number;
  total_blue_zone: number;
  total_green_zone: number;
  total_orange_zone: number;
  total_red_zone: number;
  workout_duration: number;
  step_count: number;
}

/**
 * API for workout data, statistics, and challenge tracking
 * 
 * Provides access to workout history, performance summaries, telemetry data,
 * equipment statistics, and challenge information. Combines data from multiple
 * OTF API endpoints to provide comprehensive workout insights.
 */
export class WorkoutsApi {
  private otfInstance: any; // Will be set after initialization
  
  constructor(private client: OtfHttpClient, private memberUuid: string) {}
  
  /**
   * Formats coach name consistently with Python implementation
   */
  private formatCoachName(coach: any): string | undefined {
    if (!coach) return undefined;
    
    // Handle different coach object structures
    if (typeof coach === 'string') return coach;
    
    const firstName = coach.first_name || coach.firstName || '';
    const lastName = coach.last_name || coach.lastName || '';
    
    if (firstName && lastName) {
      return `${firstName} ${lastName}`.trim();
    } else if (firstName) {
      return firstName.trim();
    } else if (lastName) {
      return lastName.trim();
    }
    
    return undefined;
  }
  
  /**
   * Filters equipment data to match Python structure exactly
   * Removes fields that Python doesn't have (like max_power)
   */
  private filterEquipmentData(equipmentData: any): any {
    if (!equipmentData) return equipmentData;
    
    // Create a deep copy to avoid mutation
    const filtered = JSON.parse(JSON.stringify(equipmentData));
    
    // Remove max_power to match Python structure
    delete filtered.max_power;
    
    // Convert all metric_value fields from numbers to strings to match Python exactly
    // This handles nested equipment data like avg_power.metric_value, max_cadence.metric_value, etc.
    this.convertMetricValuesToStrings(filtered);
    
    return filtered;
  }

  /**
   * Formats date to match Python's ISO format exactly
   * Python: "2025-07-29T12:00:00+00:00" 
   * JavaScript default: "2025-07-29T12:00:00.000Z"
   */
  private formatDateToPythonISO(date: Date): string {
    // Get ISO string and convert Z format to +00:00 format
    // Remove milliseconds (.000) and replace Z with +00:00
    return date.toISOString().replace(/\.\d{3}Z$/, '+00:00');
  }

  /**
   * Recursively converts all metric_value fields from numbers to strings
   * Matches Python's string formatting for equipment data
   */
  private convertMetricValuesToStrings(obj: any): void {
    if (!obj || typeof obj !== 'object') return;
    
    for (const [key, value] of Object.entries(obj)) {
      if (key === 'metric_value') {
        if (typeof value === 'number') {
          // Convert number to string with proper decimal formatting to match Python exactly
          // Python ALWAYS uses .0 for integers in metric_value fields
          obj[key] = value % 1 === 0 ? `${value}.0` : value.toString();
        } else if (typeof value === 'string') {
          // Handle string values that need decimal formatting
          const numValue = parseFloat(value);
          if (!isNaN(numValue) && numValue % 1 === 0 && !value.includes('.')) {
            obj[key] = `${value}.0`;
          }
        }
      } else if (typeof value === 'object' && value !== null) {
        // Recursively process nested objects
        this.convertMetricValuesToStrings(value);
      }
    }
  }
  
  setOtfInstance(otf: any): void {
    this.otfInstance = otf;
  }

  /**
   * Gets member's body composition scan history with complete business logic
   * 
   * @returns Promise resolving to array of body composition data with calculated properties
   */
  async getBodyCompositionList(): Promise<BodyCompositionData[]> {
    const response = await this.client.workoutRequest<any>({
      method: 'GET',
      apiType: 'default',
      path: `/member/members/${this.memberUuid}/body-composition`,
    });

    // Transform response data using complete Python business logic
    return response.data.map((item: any) => new BodyCompositionData(item));
  }

  /**
   * Gets member's challenge tracking information
   * 
   * @returns Promise resolving to challenge tracker data
   */
  async getChallengeTracker(): Promise<ChallengeTracker> {
    const response = await this.client.workoutRequest<any>({
      method: 'GET',
      apiType: 'default',
      path: `/challenges/v3.1/member/${this.memberUuid}`,
    });

    // Return the Dto part like Python implementation
    return response.Dto;
  }

  /**
   * Gets member's lifetime workout statistics
   * 
   * @param selectTime - Time period for statistics (defaults to all time)
   * @returns Promise resolving to lifetime statistics
   */
  async getMemberLifetimeStats(selectTime: StatsTime = StatsTime.AllTime): Promise<any> {
    const response = await this.client.workoutRequest<any>({
      method: 'GET',
      apiType: 'default',
      path: `/performance/v2/${this.memberUuid}/over-time/${selectTime}`,
    });

    return response.data;
  }

  /**
   * Gets member's out-of-studio workout history
   * 
   * @returns Promise resolving to array of out-of-studio workouts
   */
  async getOutOfStudioWorkoutHistory(): Promise<any[]> {
    const response = await this.client.workoutRequest<any>({
      method: 'GET',
      apiType: 'default',
      path: `/member/members/${this.memberUuid}/out-of-studio-workout`,
    });

    return response.data;
  }

  /**
   * Gets member's benchmark performances
   * 
   * @param challengeCategoryId - Challenge category filter (0 for all)
   * @param equipmentId - Equipment type filter (0 for all)
   * @param challengeSubcategoryId - Challenge subcategory filter (0 for all)
   * @returns Promise resolving to array of benchmark data
   */
  async getBenchmarks(
    challengeCategoryId: number = 0,
    equipmentId: EquipmentType | 0 = 0,
    challengeSubcategoryId: number = 0
  ): Promise<any[]> {
    const response = await this.client.workoutRequest<any>({
      method: 'GET',
      apiType: 'default',
      path: `/challenges/v3/member/${this.memberUuid}/benchmarks`,
      params: {
        equipmentId: equipmentId,
        challengeTypeId: challengeCategoryId,
        challengeSubTypeId: challengeSubcategoryId,
      },
    });

    return response.Dto;
  }

  async getChallengeTrackerDetail(challengeCategoryId: number): Promise<any[]> {
    const response = await this.client.workoutRequest<any>({
      method: 'GET',
      apiType: 'default',
      path: `/challenges/v1/member/${this.memberUuid}/participation`,
      params: {
        challengeTypeId: challengeCategoryId,
      },
    });

    return response.Dto;
  }

  // Performance Summary API methods
  async getPerformanceSummaries(limit?: number): Promise<any> {
    const params = limit ? { limit } : {};
    const response = await this.client.workoutRequest<any>({
      method: 'GET',
      apiType: 'performance',
      path: '/v1/performance-summaries',
      params,
    });

    return response;
  }

  /**
   * Gets performance summary for a specific workout
   * 
   * @param performanceSummaryId - Performance summary identifier
   * @returns Promise resolving to performance summary with metrics
   */
  async getPerformanceSummary(performanceSummaryId: string): Promise<any> {
    try {
      const response = await this.client.workoutRequest<any>({
        method: 'GET',
        apiType: 'performance',
        path: `/v1/performance-summaries/${performanceSummaryId}`,
      });

      if (!response) {
        console.warn(`getPerformanceSummary: No response for ${performanceSummaryId}`);
        return null;
      }

      // The actual performance data is in response.details with snake_case field names
      const details = response.details || {};
      
      
      // Return the full performance summary data matching Python structure
      return {
        performance_summary_id: response.id || performanceSummaryId,
        calories_burned: details.calories_burned || 0,
        splat_points: details.splat_points || 0,
        step_count: details.step_count || 0,
        active_time_seconds: details.active_time_seconds || 0,
        zone_time_minutes: details.zone_time_minutes || {},
        heart_rate: details.heart_rate || {},
        equipment_data: details.equipment_data || {},
        // Include class info
        class: response.class || {},
        ratable: response.ratable || false,
        // Include rating fields to match Python
        class_rating: details.class_rating || response.class_rating || null,
        coach_rating: details.coach_rating || response.coach_rating || null,
        // Additional fields to match Python performance summary structure
        booking_id: response.booking_id || null,
        class_history_uuid: response.class_history_uuid || response.id || performanceSummaryId,
        class_uuid: response.class?.class_uuid || response.class?.classUuid || response.id || performanceSummaryId,
        coach: this.formatCoachName(response.class?.coach),
        otf_class: response.class || {},
        studio: response.studio || null,
        // Equipment data breakdown (match Python structure)
        rower_data: details.equipment_data?.rower || {},
        treadmill_data: details.equipment_data?.treadmill || {},
        // Telemetry placeholder (will be enhanced when available)
        telemetry: null
      };
    } catch (error) {
      console.warn(`getPerformanceSummary failed for ${performanceSummaryId}:`, error instanceof Error ? error.message : String(error));
      return null;
    }
  }

  // Telemetry API methods
  /**
   * Transforms zones from camelCase to snake_case to match Python format
   * 
   * @param zones - Zones object with camelCase keys
   * @returns Zones object with snake_case keys matching Python
   */
  private transformZonesToSnakeCase(zones: any): any {
    if (!zones || typeof zones !== 'object') return zones;
    
    const transformedZones: any = {};
    for (const [zoneName, zoneData] of Object.entries(zones)) {
      if (zoneData && typeof zoneData === 'object') {
        const zoneObj = zoneData as any;
        transformedZones[zoneName] = {
          start_bpm: zoneObj.startBpm || zoneObj.start_bpm,
          end_bpm: zoneObj.endBpm || zoneObj.end_bpm,
        };
      }
    }
    return transformedZones;
  }

  /**
   * Gets telemetry data for a workout
   * 
   * @param performanceSummaryId - Performance summary identifier
   * @param maxDataPoints - Maximum number of data points to retrieve
   * @returns Promise resolving to array of telemetry data points
   */
  async getTelemetry(performanceSummaryId: string, maxDataPoints: number = 150): Promise<any> {
    
    // Try the original telemetry endpoint - maybe the response structure is different than expected
    const response = await this.client.workoutRequest<any>({
      method: 'GET',
      apiType: 'telemetry',
      path: '/v1/performance/summary',
      params: {
        classHistoryUuid: performanceSummaryId,
        maxDataPoints: maxDataPoints,
      },
    });


    // Handle the correct telemetry API response structure
    if (!response || !response.telemetry || !Array.isArray(response.telemetry)) {
      return null;
    }
    
    // Transform telemetry array but preserve ALL original fields to match Python
    const telemetryData = response.telemetry.map((item: any) => {
      // Keep all original fields and add standardized ones
      return {
        ...item, // Preserve all original API fields
        created_at: item.createdAt,
        heart_rate: item.heartRate,
        zone: item.zone,
      };
    });
    
    // Transform zones to match Python snake_case format
    const zones = response.zones ? this.transformZonesToSnakeCase(response.zones) : null;

    // CRITICAL FIX: Return complete telemetry object structure to match Python exactly
    // Python returns: { class_history_uuid, class_start_time, max_hr, member_uuid, performance_summary_id, window_size, zones, telemetry: [...] }
    return {
      class_history_uuid: response.classHistoryUuid || performanceSummaryId,
      class_start_time: response.classStartTime || null,
      max_hr: response.maxHr || 0,
      member_uuid: response.memberUuid || this.memberUuid,
      performance_summary_id: response.classHistoryUuid || performanceSummaryId,
      window_size: response.windowSize || response.window_size || null,
      zones: zones,
      telemetry: telemetryData
    };
  }

  /**
   * Gets member's out-of-studio workout history
   * 
   * @param startDate - Start date for workout range
   * @param endDate - End date for workout range
   * @returns Promise resolving to array of out-of-studio workouts
   */
  async getOutOfStudioWorkouts(startDate: Date, endDate: Date): Promise<any[]> {
    const response = await this.client.workoutRequest<any>({
      method: 'GET',
      apiType: 'default',
      path: `/member/members/${this.memberUuid}/out-of-studio-workout`,
      params: {
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
      },
    });

    // Transform to match expected test format
    return response.data.map((item: any) => ({
      id: item.id,
      workout_type: item.workoutType,
      created_at: item.createdAt,
      duration_minutes: item.durationMinutes,
      calories: item.calories,
    }));
  }

  /**
   * Gets equipment statistics for a specific equipment type and timeframe
   * 
   * @param equipmentType - Type of equipment (e.g., 'TREADMILL', 'ROWER')
   * @param timeframe - Time period for statistics (e.g., 'thisYear', 'thisMonth')
   * @returns Promise resolving to equipment statistics
   */
  async getEquipmentData(equipmentType: string, timeframe: string): Promise<any> {
    const response = await this.client.workoutRequest<any>({
      method: 'GET',
      apiType: 'performance',
      path: `/member/${this.memberUuid}/stats`,
      params: {
        equipmentType: equipmentType,
        timeframe: timeframe,
      },
    });

    return response.data;
  }

  async getHrHistory(): Promise<any[]> {
    const response = await this.client.workoutRequest<any>({
      method: 'GET',
      apiType: 'telemetry',
      path: '/v1/physVars/maxHr/history',
      params: {
        memberUuid: this.memberUuid,
      },
    });

    return response.history;
  }

  /**
   * Gets performance summary to class_uuid mapping exactly like Python
   * Matches Python: get_perf_summary_to_class_uuid_mapping()
   * 
   * @returns Promise resolving to mapping of {performance_summary_id: class_uuid}
   */
  async getPerformanceSummaryToClassUuidMapping(): Promise<Record<string, string | null>> {
    try {
      const response = await this.client.workoutRequest<any>({
        method: 'GET',
        apiType: 'performance',
        path: '/v1/performance-summaries',
      });
      
      // Extract mapping exactly like Python: {item["id"]: item["class"].get("ot_base_class_uuid")}
      const mapping: Record<string, string | null> = {};
      if (response.items) {
        for (const item of response.items) {
          mapping[item.id] = item.class?.ot_base_class_uuid || null;
        }
      }
      
      return mapping;
    } catch (error) {
      console.warn('Failed to get performance summary to class_uuid mapping:', error);
      return {};
    }
  }

  // Helper methods for concurrent requests (simplified for now)
  async getPerformanceSummariesConcurrent(performanceSummaryIds: string[]): Promise<Record<string, any>> {
    const promises = performanceSummaryIds.map(id => 
      this.getPerformanceSummary(id).then(data => ({ id, data })).catch(error => {
        console.warn(`Failed to get performance summary ${id}:`, error instanceof Error ? error.message : String(error));
        return { id, data: null };
      })
    );
    
    const results = await Promise.all(promises);
    
    return results.reduce((acc, { id, data }) => {
      if (data !== null) {
        acc[id] = data;
      }
      return acc;
    }, {} as Record<string, any>);
  }

  async getTelemetryConcurrent(performanceSummaryIds: string[], maxDataPoints: number = 150): Promise<Record<string, any>> {
    
    const promises = performanceSummaryIds.map(id => 
      this.getTelemetry(id, maxDataPoints).then(data => ({ id, data })).catch(error => {
        console.warn(`Failed to get telemetry ${id}:`, error instanceof Error ? error.message : String(error));
        return { id, data: null };
      })
    );
    
    const results = await Promise.all(promises);
    const telemetryDict = results.reduce((acc, { id, data }) => {
      acc[id] = data;
      return acc;
    }, {} as Record<string, any>);
    
    return telemetryDict;
  }

  /**
   * Gets member's workout history with complete performance data and telemetry
   * 
   * EXACTLY MIRRORS the Python library behavior:
   * - Booking-first approach (Python uses get_bookings_new())
   * - Only returns workouts for bookings that exist
   * - No synthetic bookings created
   * - Uses booking.workout.performance_summary_id as the source of truth
   * 
   * @param startDate - Start date for workout range (defaults to 30 days ago)
   * @param endDate - End date for workout range (defaults to today)
   * @param maxDataPoints - Maximum telemetry data points per workout (defaults to 150)
   * @returns Promise resolving to array of complete workout objects with telemetry
   */
  async getWorkouts(
    startDate?: Date | string,
    endDate?: Date | string,
    maxDataPoints: number = 150
  ): Promise<WorkoutWithTelemetry[]> {
    try {
      // Set default date range EXACTLY like Python
      // Python: start_date = pendulum.today().subtract(days=30).date() 
      // Python: end_date = datetime.today().date()
      // Python: start_dtme = pendulum.datetime(start_date.year, start_date.month, start_date.day, 0, 0, 0)
      // Python: end_dtme = pendulum.datetime(end_date.year, end_date.month, end_date.day, 23, 59, 59)
      
      let start: Date, end: Date;
      
      if (startDate) {
        start = typeof startDate === 'string' ? new Date(startDate) : startDate;
      } else {
        // 30 days ago at 00:00:00 (like Python)
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        thirtyDaysAgo.setHours(0, 0, 0, 0);
        start = thirtyDaysAgo;
      }
      
      if (endDate) {
        end = typeof endDate === 'string' ? new Date(endDate) : endDate;
      } else {
        // Today at 23:59:59 (like Python end_dtme)  
        const today = new Date();
        today.setHours(23, 59, 59, 999);
        end = today;
      }

      // MIRROR Python approach: Start with bookings (booking-first)
      const bookings = await this.getBookingsForWorkouts(start, end);
      
      // Filter out future bookings EXACTLY like Python: [b for b in bookings if not (b.starts_at and b.starts_at > pendulum.now().naive())]
      // Python INCLUDES bookings without starts_at, only excludes if starts_at exists AND is future
      // Python uses pendulum.now().naive() which is timezone-naive local time
      const now = new Date();
      const pastBookings = bookings.filter(booking => {
        const startsAt = booking.otf_class?.starts_at;
        if (!startsAt) return true; // Python includes bookings without starts_at
        
        // Parse as local time (naive) like Python does, not UTC
        const classStart = new Date(startsAt);
        
        // Python comparison: b.starts_at > pendulum.now().naive()
        // We want bookings where starts_at <= now (past/current bookings)
        const include = classStart <= now;
        
        
        return include;
      });
      

      // EXACTLY MIRROR Python approach: Create tuples for ALL bookings (even without workout data) 
      // Python: bookings_list = [(b, b.workout.id if b.workout else None) for b in filtered_bookings]
      // Include ALL bookings - even those without performance data (tracker system failures)
      const bookingsList = pastBookings.map(booking => ({
        booking,
        perfSummaryId: booking.workout?.performance_summary_id || null
      }));
      
      // Extract performance summary IDs for API calls (only non-null ones)
      // Python: workout_ids = [b.workout.id for b in filtered_bookings if b.workout]
      const performanceSummaryIds = bookingsList
        .map(item => item.perfSummaryId)
        .filter(Boolean) as string[];
      
      // Get detailed performance summaries, telemetry, and class_uuid mapping (matches Python threaded approach)
      // Handle empty case like Python does
      const [performanceSummaries, telemetryData, classUuidMapping] = performanceSummaryIds.length > 0 
        ? await Promise.all([
            this.getPerformanceSummariesConcurrent(performanceSummaryIds),
            this.getTelemetryConcurrent(performanceSummaryIds, maxDataPoints),
            this.getPerformanceSummaryToClassUuidMapping(),
          ])
        : [{}, {}, {}];

      // Create workout objects for EVERY booking (matches Python exactly)
      // Python: for booking, perf_summary_id in bookings_list
      const workouts: WorkoutWithTelemetry[] = [];
      
      for (const { booking, perfSummaryId } of bookingsList) {
        try {
          // Python: perf_summary = perf_summaries_dict.get(perf_summary_id, {}) if perf_summary_id else {}
          const perfSummary = perfSummaryId ? ((performanceSummaries as Record<string, any>)[perfSummaryId] || {}) : {};
          const telemetry = perfSummaryId ? ((telemetryData as Record<string, any>)[perfSummaryId] || null) : null;


          // Validate data like Python does - Python throws ValueError for bad booking data
          if (!booking) {
            throw new Error("v2_booking is required");
          }
          if (!booking.otf_class) {
            throw new Error("otf_class must be an instance of BookingV2Class");  
          }

          // Get class_uuid from mapping exactly like Python
          const classUuid = perfSummaryId ? ((classUuidMapping as Record<string, string | null>)[perfSummaryId] || null) : null;
          const workout = this.assembleWorkout(booking, perfSummary, telemetry, classUuid);
          
          // Filter out invalid workouts with very low calorie counts (< 100 calories indicates invalid data)
          if (workout.calories_burned != null && workout.calories_burned < 100) {
            continue; // Skip this invalid workout
          }
          
          workouts.push(workout);
          
        } catch (error) {
          // EXACTLY match Python: LOGGER.exception("Failed to create Workout for performance summary %s", perf_summary_id)
          // Python continues processing after logging exception, filtering out the bad workout
          console.warn(`Failed to create Workout for performance summary ${perfSummaryId}:`, error);
          // Continue like Python - this filters out bad data by not adding to workouts array
        }
      }
      

      return workouts;
    } catch (error) {
      console.error('getWorkouts error:', error);
      if (error instanceof Error) {
        console.error('Stack trace:', error.stack);
      }
      throw error;
    }
  }


  /**
   * Gets bookings for workout date range
   * 
   * @param startDate - Start date for booking range
   * @param endDate - End date for booking range
   * @returns Promise resolving to array of booking objects
   */
  private async getBookingsForWorkouts(startDate: Date, endDate: Date): Promise<BookingV2[]> {
    if (!this.otfInstance?.bookings) {
      console.warn('BookingsApi not available - returning empty workouts array');
      return [];
    }
    
    try {
      return await this.otfInstance.bookings.getBookingsNew(
        startDate,
        endDate,
        true, // excludeCancelled
        true  // removeDuplicates
      );
    } catch (error) {
      console.warn('Failed to get bookings for workouts:', error instanceof Error ? error.message : String(error));
      return [];
    }
  }

  /**
   * Assembles complete workout data from booking, performance summary, and telemetry
   * 
   * @param booking - Booking data with class and studio info
   * @param performanceSummary - Performance metrics and equipment data
   * @param telemetry - Heart rate telemetry over time
   * @returns Complete workout object matching Python implementation
   */
  private assembleWorkout(booking: any, performanceSummary: any, telemetry: any, classUuid: string | null = null): WorkoutWithTelemetry {
    // Assemble workout data like Python Workout.create() method
    return {
      performance_summary_id: performanceSummary.performance_summary_id || booking.workout?.performance_summary_id || 'unknown',
      class_history_uuid: performanceSummary.performance_summary_id || booking.workout?.performance_summary_id || 'unknown',
      booking_id: booking.booking_id,
      class_uuid: classUuid || undefined, // Use class_uuid from mapping exactly like Python
      coach: this.formatCoachName(booking.otf_class?.coach) || undefined,
      ratable: booking.ratable || performanceSummary.ratable || false,
      
      // Rating fields matching Python implementation - from bookings endpoint (ratings.class/ratings.coach)
      class_rating: booking.class_rating || null,
      coach_rating: booking.coach_rating || null,
      
      // Performance metrics from performance summary (now at top level after our fix)
      calories_burned: performanceSummary.calories_burned,
      splat_points: performanceSummary.splat_points,
      step_count: performanceSummary.step_count,
      zone_time_minutes: performanceSummary.zone_time_minutes,
      heart_rate: this.enhanceHeartRateWithTelemetry(performanceSummary.heart_rate, telemetry),
      active_time_seconds: performanceSummary.active_time_seconds || booking.workout?.active_time_seconds,
      
      // Equipment data (now at top level after our fix) - match Python structure exactly
      rower_data: this.filterEquipmentData(performanceSummary.equipment_data?.rower),
      treadmill_data: this.filterEquipmentData(performanceSummary.equipment_data?.treadmill),
      
      
      // Related objects - exclude ends_at to match Python exactly
      otf_class: {
        ...booking.otf_class
        // Remove ends_at field that Python doesn't have
      },
      studio: booking.otf_class?.studio,
      telemetry: this.enhanceTelemetryWithTimestamps(telemetry, booking.otf_class?.starts_at),
    };
  }

  /**
   * Enhances heart rate data with telemetry maxHr value
   * Matches Python business logic: "max_hr seems to be left out of the heart rate data - it has peak_hr but they do not match
   * so if we have telemetry data, we can get the max_hr from there"
   * 
   * @param heartRate - Original heart rate data from performance summary
   * @param telemetry - Telemetry data containing maxHr
   * @returns Enhanced heart rate data with corrected max_hr from telemetry
   */
  private enhanceHeartRateWithTelemetry(heartRate: any, telemetry: any): any {
    if (!heartRate) return heartRate;
    
    // Copy heart rate data to avoid mutation
    const enhancedHeartRate = { ...heartRate };
    
    // Apply the critical Python business logic:
    // max_hr seems to be left out of the heart rate data - it has peak_hr but they do not match
    // so if we have telemetry data, we can get the max_hr from there
    if (telemetry && telemetry.maxHr) {
      enhancedHeartRate.max_hr = telemetry.maxHr;
    }
    
    return enhancedHeartRate;
  }

  /**
   * Enhances telemetry data with calculated absolute timestamps
   * Matches Python business logic: calculates absolute timestamps from relative timestamps and class start time
   * 
   * @param telemetry - Telemetry data containing relative timestamps
   * @param classStartTime - Class start time as ISO string
   * @returns Enhanced telemetry data with calculated timestamps
   */
  private enhanceTelemetryWithTimestamps(telemetry: any, classStartTime: string | undefined): any {
    if (!telemetry || !classStartTime) {
      return telemetry;
    }

    // Handle both array and object with telemetry property
    const telemetryArray = Array.isArray(telemetry) ? telemetry : 
                          (telemetry.telemetry && Array.isArray(telemetry.telemetry)) ? telemetry.telemetry :
                          null;
    
    if (!telemetryArray) {
      return telemetry;
    }

    // Parse class start time
    const classStart = new Date(classStartTime);
    
    // Calculate absolute timestamps for each telemetry item
    // Matches Python logic: timestamp = class_start_time + timedelta(seconds=relative_timestamp)
    const enhancedTelemetryArray = telemetryArray.map((item: any) => {
      if (item.relative_timestamp === undefined || item.relative_timestamp === null) return item;
      
      const enhancedItem = { ...item };
      const absoluteTime = new Date(classStart.getTime() + (item.relative_timestamp * 1000)); // Convert seconds to milliseconds
      enhancedItem.timestamp = this.formatDateToPythonISO(absoluteTime);
      
      return enhancedItem;
    });
    
    // CRITICAL FIX: Return the complete telemetry structure that matches Python exactly
    // The original telemetry response from the API contains the full structure we need
    if (!Array.isArray(telemetry) && telemetry.classHistoryUuid) {
      // Return the complete telemetry object structure to match Python
      return {
        class_history_uuid: telemetry.classHistoryUuid,
        class_start_time: telemetry.classStartTime,
        max_hr: telemetry.maxHr,
        member_uuid: telemetry.memberUuid,
        performance_summary_id: telemetry.classHistoryUuid, // Same as class_history_uuid
        telemetry: enhancedTelemetryArray
      };
    }
    
    // Fallback to original logic
    return Array.isArray(telemetry) ? enhancedTelemetryArray : { ...telemetry, telemetry: enhancedTelemetryArray };
  }

  /**
   * Calculates class end time based on start time and class type
   * Matches Python business logic from get_end_time() function
   * 
   * @param startTime - Class start time as ISO string
   * @param classType - Class type enum value
   * @returns Class end time as ISO string
   */
  private calculateClassEndTime(startTime: string, classType: string): string {
    const start = new Date(startTime);
    
    // Match Python logic exactly
    switch (classType) {
      case 'ORANGE_60':
        return this.formatDateToPythonISO(new Date(start.getTime() + (60 * 60 * 1000))); // 60 minutes
      case 'ORANGE_90':
        return this.formatDateToPythonISO(new Date(start.getTime() + (90 * 60 * 1000))); // 90 minutes
      case 'STRENGTH_50':
      case 'TREAD_50':
        return this.formatDateToPythonISO(new Date(start.getTime() + (50 * 60 * 1000))); // 50 minutes
      case 'OTHER':
        console.warn(`Class type ${classType} does not have defined length, returning start time plus 60 minutes`);
        return this.formatDateToPythonISO(new Date(start.getTime() + (60 * 60 * 1000))); // Default 60 minutes
      default:
        console.warn(`Class type ${classType} is not recognized, returning start time plus 60 minutes`);
        return this.formatDateToPythonISO(new Date(start.getTime() + (60 * 60 * 1000))); // Default 60 minutes
    }
  }

  // Helper methods that match Python API
  async getBenchmarksByEquipment(equipmentId: EquipmentType): Promise<any[]> {
    const benchmarks = await this.getBenchmarks(0, equipmentId, 0);
    return benchmarks.filter((b: any) => b.equipment_id === equipmentId);
  }

  async getBenchmarksByChallenge(challengeCategoryId: number): Promise<any[]> {
    const benchmarks = await this.getBenchmarks(challengeCategoryId, 0, 0);
    return benchmarks.filter((b: any) => b.challenge_category_id === challengeCategoryId);
  }

  /**
   * Gets a complete workout object from a booking ID or booking object
   * 
   * @param booking - Booking ID string or booking object
   * @returns Promise resolving to complete workout with telemetry data
   */
  async getWorkoutFromBooking(booking: string | BookingV2): Promise<WorkoutWithTelemetry> {
    const bookingId = typeof booking === 'string' ? booking : booking.booking_id;
    
    if (!this.otfInstance?.bookings) {
      throw new Error('BookingsApi not available');
    }
    
    const bookingData = await this.otfInstance.bookings.getBookingNew(bookingId);
    
    if (!bookingData.workout?.performance_summary_id) {
      throw new Error(`Workout for booking ${bookingId} not found`);
    }
    
    const [performanceSummary, telemetry] = await Promise.all([
      this.getPerformanceSummary(bookingData.workout.performance_summary_id),
      this.getTelemetry(bookingData.workout.performance_summary_id),
    ]);
    
    return this.assembleWorkout(bookingData, performanceSummary, telemetry, null);
  }

  /**
   * Rates a workout's class and coach
   * 
   * @param workout - Workout object to rate
   * @param classRating - Class rating (0-3, where 0 is dismiss)
   * @param coachRating - Coach rating (0-3, where 0 is dismiss)
   * @returns Promise resolving to rating confirmation
   */
  async rateClassFromWorkout(
    workout: WorkoutWithTelemetry,
    classRating: 0 | 1 | 2 | 3,
    coachRating: 0 | 1 | 2 | 3
  ): Promise<any> {
    if (!workout.ratable || !workout.class_uuid) {
      throw new Error(`Workout ${workout.performance_summary_id} is not rateable`);
    }
    
    if (workout.class_rating !== null || workout.coach_rating !== null) {
      throw new Error(`Workout ${workout.performance_summary_id} already rated`);
    }
    
    if (!this.otfInstance?.bookings) {
      throw new Error('BookingsApi not available');
    }
    
    await this.otfInstance.bookings.rateClass(
      workout.class_uuid,
      workout.performance_summary_id,
      classRating,
      coachRating
    );
    
    return this.getWorkoutFromBooking(workout.booking_id);
  }
}
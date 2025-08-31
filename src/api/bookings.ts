import { components } from '../generated/types';
import { formatDateToPythonISO, formatDateForPythonParity, safeDateFormat } from '../utils/datetime';

type BookingV2Base = components['schemas']['BookingV2'];
type BookingStatus = components['schemas']['BookingStatus'];

interface BookingV2 extends BookingV2Base {
  status: BookingStatus;
  class_rating: {
    id: string;
    description: string;
    value: number;
  } | null;
  coach_rating: {
    id: string;
    description: string;
    value: number;
  } | null;
}
import { OtfHttpClient } from '../client/http-client';

/**
 * Gets booking status priority for sorting purposes
 * Matches Python BookingStatus.priority() method exactly
 * 
 * @param status - Booking status enum value
 * @returns Priority number (lower = higher priority)
 */
function getBookingStatusPriority(status: BookingStatus): number {
  // Match Python priorities exactly from enums.py:22-37
  const priorities: Record<BookingStatus, number> = {
    'Booked': 0,
    'Confirmed': 1,
    'Waitlisted': 2,
    'Pending': 3,
    'Requested': 4,
    'Checked In': 5,
    'Checkin Pending': 6,
    'Checkin Requested': 7,
    'Checkin Cancelled': 8,
    'Cancelled': 9,
    'Late Cancelled': 10,
    'Cancel Checkin Pending': 11,
    'Cancel Checkin Requested': 12,
  };
  
  return priorities[status] ?? 999; // Default to 999 for unknown statuses
}

/**
 * Helper function to safely convert date to timestamp
 * Matches Python _safe_ts() function
 * 
 * @param dateStr - ISO date string or null/undefined
 * @returns Timestamp or Infinity for invalid dates
 */
function safeTimestamp(dateStr: string | null | undefined): number {
  if (!dateStr) return Infinity;
  
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return Infinity;
  
  // Check if it's the minimum date (like Python datetime.min)
  if (date.getTime() === new Date(0).getTime()) return Infinity;
  
  return date.getTime() / 1000; // Convert to seconds like Python timestamp()
}

/**
 * Gets sort key for booking deduplication
 * Matches Python BookingV2.get_sort_key() method exactly
 * 
 * @param booking - Booking object
 * @returns Tuple array for sorting [starts_at, -updated_at, -created_at, status_priority]
 */
function getBookingSortKey(booking: BookingV2): [number, number, number, number] {
  // Parse starts_at time
  const startsAt = booking.otf_class?.starts_at ? new Date(booking.otf_class.starts_at).getTime() / 1000 : 0;
  
  // Use negative timestamps to favor later ones (more recent updated_at/created_at is better)
  const updatedAt = -safeTimestamp(booking.updated_at);
  const createdAt = -safeTimestamp(booking.created_at);
  
  const statusPriority = getBookingStatusPriority(booking.status);
  
  return [startsAt, updatedAt, createdAt, statusPriority];
}

/**
 * API for class booking and cancellation operations
 * 
 * Provides access to booking details and workout class management.
 */
export class BookingsApi {
  /**
   * @param client - HTTP client for API requests
   * @param memberUuid - Authenticated member's UUID
   */
  constructor(private client: OtfHttpClient, private memberUuid: string) {}
  
  /**
   * Formats date to match Python's ISO format exactly
   * Python: "2025-07-29T12:00:00+00:00" 
   * JavaScript default: "2025-07-29T12:00:00.000Z"
   */

  /**
   * Formats coach name consistently, handling undefined/null fields
   */
  private formatCoachName(coach: any): string | null {
    if (!coach) return null;
    
    // Handle different coach object structures
    if (typeof coach === 'string') return coach;
    
    const firstName = coach.firstName || coach.first_name || '';
    const lastName = coach.lastName || coach.last_name || '';
    
    if (firstName && lastName) {
      return `${firstName} ${lastName}`.trim();
    } else if (firstName) {
      return firstName.trim();
    } else if (lastName) {
      return lastName.trim();
    }
    
    return null;
  }

  /**
   * Gets detailed booking information
   * 
   * @param bookingId - Unique booking identifier
   * @returns Promise resolving to booking details with class and studio info
   */
  async getBookingNew(bookingId: string): Promise<BookingV2> {
    const response = await this.client.workoutRequest<any>({
      method: 'GET',
      apiType: 'performance',
      path: `/v1/bookings/${bookingId}`,
    });

    // Transform booking data to match expected structure
    return this.transformBookingData(response);
  }

  /**
   * Gets all bookings for the member in a date range
   * 
   * @param startDate - Start date for booking range
   * @param endDate - End date for booking range
   * @param excludeCancelled - Whether to exclude cancelled bookings
   * @param removeDuplicates - Whether to remove duplicate bookings
   * @returns Promise resolving to array of booking objects
   */
  async getBookingsNew(
    startDate: Date,
    endDate: Date,
    excludeCancelled: boolean = true,
    removeDuplicates: boolean = true
  ): Promise<BookingV2[]> {
    const response = await this.client.workoutRequest<any>({
      method: 'GET',
      apiType: 'performance',
      path: '/v1/bookings/me',
      params: {
        'starts_after': formatDateToPythonISO(startDate),
        'ends_before': formatDateToPythonISO(endDate),
        'include_canceled': (!excludeCancelled).toString(),
        'expand': 'false',
      },
    });

    let bookings = response.items.map((item: any) => this.transformBookingData(item));

    // Remove duplicates if requested (matches Python implementation exactly)
    if (removeDuplicates) {
      bookings = this.deduplicateBookings(bookings);
    }

    return bookings;
  }

  private transformBookingData(data: any): BookingV2 {
    // Transform API response to match exact Python BookingV2 model structure
    const transformedData: BookingV2 = {
      // Required fields matching Python model exactly - updated for actual API response format
      booking_id: data.bookingId || data.id || '',
      member_uuid: data.member_id || this.memberUuid, 
      person_id: data.person_id || this.memberUuid,
      service_name: data.service_name || null,
      cross_regional: data.cross_regional || null,
      intro: data.intro || null,
      checked_in: Boolean(data.checked_in),
      canceled: Boolean(data.canceled),
      late_canceled: data.late_canceled || null,
      canceled_at: data.canceled_at || null,
      ratable: Boolean(data.ratable),
      status: data.status as BookingStatus, // Critical field for deduplication priority
      
      // Rating fields exactly like Python: AliasPath("ratings", "coach") and AliasPath("ratings", "class")
      class_rating: data.ratings?.class || null,
      coach_rating: data.ratings?.coach || null,
      
      // OTF Class - must match BookingV2Class exactly - updated for actual API response format
      otf_class: {
        class_uuid: data.class?.classUuid || data.class?.class_uuid || null,
        name: data.class?.name || '',
        starts_at: data.class?.starts_at_local || data.class?.startsAtLocal || data.class?.startsAt || data.class?.starts_at || '',
        coach: this.formatCoachName(data.class?.coach),
        studio: data.class?.studio ? {
          studio_uuid: data.class.studio.studioUuid || data.class.studio.id || '',
          name: data.class.studio.name || null,
          phone_number: null, // Always null to match Python behavior
          latitude: data.class.studio.latitude || null,
          longitude: data.class.studio.longitude || null,
          time_zone: data.class.studio.time_zone || null,
          email: data.class.studio.email || null,
          address: data.class.studio.address ? {
            address_line1: data.class.studio.address.line1 || null,
            address_line2: data.class.studio.address.line2 || null,
            city: data.class.studio.address.city || null,
            postal_code: data.class.studio.address.postal_code || null,
            state: data.class.studio.address.state || null,
            country: data.class.studio.address.country || null,
            region: null,
            country_id: null,
          } : null,
          currency_code: data.class.studio.currency_code || null,
          mbo_studio_id: data.class.studio.mbo_studio_id || null,
        } : null,
        class_id: data.class?.id || null,
        class_type: data.class?.type || {}, // Empty object to match Python behavior
        starts_at_utc: data.class?.starts_at ? formatDateToPythonISO(new Date(data.class.starts_at)) : null,
      },
      
      // Workout - should now be included with correct API parameters
      workout: data.workout ? {
        id: data.workout.performanceSummaryId || data.workout.id || '',
        performance_summary_id: data.workout.performanceSummaryId || data.workout.id || '',
        calories_burned: data.workout.caloriesBurned || data.workout.calories_burned || 0,
        splat_points: data.workout.splatPoints || data.workout.splat_points || 0,
        step_count: data.workout.stepCount || data.workout.step_count || 0,
        active_time_seconds: data.workout.activeTimeSeconds || data.workout.active_time_seconds || 0,
      } : null,
      
      
      // Additional fields from Python model
      paying_studio_id: null,
      mbo_booking_id: data.mboBookingId || null,
      mbo_unique_id: data.mboUniqueId || null,
      mbo_paying_unique_id: data.mboPayingUniqueId || null,
      created_at: data.createdAt || null,
      updated_at: data.updatedAt || null,
    };
    
    return transformedData;
  }

  /**
   * Deduplicate bookings by class_id, keeping the most recent booking
   * Matches Python _deduplicate_bookings() method exactly
   * 
   * @param bookings - Array of bookings to deduplicate
   * @returns Array of deduplicated bookings
   */
  private deduplicateBookings(bookings: BookingV2[]): BookingV2[] {
    const originalCount = bookings.length;
    
    // Group bookings by class_id
    const classesByID = new Map<string, BookingV2[]>();
    
    for (const booking of bookings) {
      if (!booking.otf_class?.class_id) continue;
      
      const classId = booking.otf_class.class_id;
      if (!classesByID.has(classId)) {
        classesByID.set(classId, []);
      }
      classesByID.get(classId)!.push(booking);
    }
    
    // For each class, keep the booking with the best sort key (minimum value)
    const keepBookings: BookingV2[] = [];
    
    for (const classBookings of classesByID.values()) {
      if (classBookings.length === 1) {
        keepBookings.push(classBookings[0]);
      } else {
        // Sort by sort key and keep the first one (best priority)
        const sortedBookings = classBookings.sort((a, b) => {
          const aKey = getBookingSortKey(a);
          const bKey = getBookingSortKey(b);
          
          // Compare tuple elements in order
          for (let i = 0; i < aKey.length; i++) {
            if (aKey[i] < bKey[i]) return -1;
            if (aKey[i] > bKey[i]) return 1;
          }
          return 0;
        });
        
        keepBookings.push(sortedBookings[0]);
      }
    }
    
    const finalCount = keepBookings.length;
    
    if (originalCount !== finalCount) {
      console.log(`Deduplication: removed ${originalCount - finalCount} duplicate bookings, kept ${finalCount}`);
    }
    
    // Sort by starts_at time like Python does (line 157 in Python booking_api.py)
    const sortedBookings = keepBookings.sort((a, b) => {
      const aStartTime = a.otf_class?.starts_at;
      const bStartTime = b.otf_class?.starts_at;
      
      if (!aStartTime && !bStartTime) return 0;
      if (!aStartTime) return 1;
      if (!bStartTime) return -1;
      
      return new Date(aStartTime).getTime() - new Date(bStartTime).getTime();
    });
    
    return sortedBookings;
  }

  /**
   * Rates a completed class
   * 
   * @param classUuid - UUID of the class to rate
   * @param performanceSummaryId - Performance summary identifier
   * @param classRating - Class rating (0-3, where 0 is dismiss)
   * @param coachRating - Coach rating (0-3, where 0 is dismiss)
   */
  async rateClass(
    classUuid: string,
    performanceSummaryId: string,
    classRating: 0 | 1 | 2 | 3,
    coachRating: 0 | 1 | 2 | 3
  ): Promise<void> {
    await this.client.workoutRequest({
      method: 'POST',
      apiType: 'performance',
      path: `/v1/classes/${classUuid}/rating`,
      body: {
        performance_summary_id: performanceSummaryId,
        class_rating: classRating,
        coach_rating: coachRating,
      },
    });
  }
}
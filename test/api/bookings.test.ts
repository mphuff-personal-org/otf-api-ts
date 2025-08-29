import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BookingsApi } from '../../src/api/bookings';
import { OtfHttpClient } from '../../src/client/http-client';

describe('BookingsApi', () => {
  let bookingsApi: BookingsApi;
  let mockClient: vi.Mocked<OtfHttpClient>;

  beforeEach(() => {
    mockClient = {
      workoutRequest: vi.fn(),
    } as any;

    bookingsApi = new BookingsApi(mockClient, 'test-member-uuid');
  });

  describe('getBookingNew', () => {
    it('should fetch and transform booking data correctly', async () => {
      const mockResponse = {
        bookingId: 'test-booking-id',
        checked_in: true,
        canceled: false,
        ratable: true,
        class: {
          classUuid: 'test-class-uuid',
          name: 'Orange 60 3G',
          startsAt: '2024-01-01T10:00:00Z',
          coach: {
            firstName: 'John',
            lastName: 'Doe'
          },
          studio: {
            studioUuid: 'studio-uuid',
            name: 'Test Studio'
          }
        },
        workout: {
          performanceSummaryId: 'performance-id',
          caloriesBurned: 500,
          splatPoints: 15,
          stepCount: 5000,
          activeTimeSeconds: 3600
        }
      };

      mockClient.workoutRequest.mockResolvedValue(mockResponse);

      const result = await bookingsApi.getBookingNew('test-booking-id');

      expect(result).toEqual({
        booking_id: 'test-booking-id',
        member_uuid: 'test-member-uuid',
        person_id: 'test-member-uuid',
        service_name: null,
        cross_regional: null,
        intro: null,
        checked_in: true,
        canceled: false,
        late_canceled: null,
        canceled_at: null,
        ratable: true,
        otf_class: {
          class_uuid: 'test-class-uuid',
          name: 'Orange 60 3G',
          starts_at: '2024-01-01T10:00:00Z',
          coach: 'John Doe',
          studio: {
            studio_uuid: 'studio-uuid',
            name: 'Test Studio',
            phone_number: null,
            latitude: null,
            longitude: null,
            time_zone: null,
            email: null,
            address: null,
            currency_code: null,
            mbo_studio_id: null,
          },
          class_id: null,
          class_type: null,
          starts_at_utc: null,
        },
        workout: {
          id: 'performance-id',
          performance_summary_id: 'performance-id',
          calories_burned: 500,
          splat_points: 15,
          step_count: 5000,
          active_time_seconds: 3600,
        },
        coach_rating: null,
        class_rating: null,
        paying_studio_id: null,
        mbo_booking_id: null,
        mbo_unique_id: null,
        mbo_paying_unique_id: null,
        created_at: null,
        updated_at: null,
      });

      expect(mockClient.workoutRequest).toHaveBeenCalledWith({
        method: 'GET',
        apiType: 'performance',
        path: '/v1/bookings/test-booking-id'
      });
    });

    it('should handle missing performance summary', async () => {
      const mockResponse = {
        bookingId: 'test-booking-id',
        checked_in: false,
        canceled: false,
        ratable: false
      };

      mockClient.workoutRequest.mockResolvedValue(mockResponse);

      const result = await bookingsApi.getBookingNew('test-booking-id');

      expect(result.booking_id).toBe('test-booking-id');
      expect(result.workout).toBe(null);
      expect(result.checked_in).toBe(false);
    });
  });

  describe('booking priority and deduplication (Python parity)', () => {
    it('should prioritize "Booked" status over "Waitlisted" in deduplication', async () => {
      const mockResponse = {
        items: [
          {
            bookingId: 'booking-1',
            status: 'Waitlisted',
            createdAt: '2024-01-01T09:00:00Z',
            updatedAt: '2024-01-01T09:00:00Z',
            class: {
              id: 'class-123',
              name: 'Orange 60',
              startsAt: '2024-01-15T10:00:00Z',
            }
          },
          {
            bookingId: 'booking-2',
            status: 'Booked',
            createdAt: '2024-01-01T10:00:00Z',
            updatedAt: '2024-01-01T10:00:00Z',
            class: {
              id: 'class-123', // Same class
              name: 'Orange 60',
              startsAt: '2024-01-15T10:00:00Z',
            }
          }
        ]
      };

      mockClient.workoutRequest.mockResolvedValue(mockResponse);

      const result = await bookingsApi.getBookingsNew(
        new Date('2024-01-01'), 
        new Date('2024-01-31'),
        true, // excludeCancelled
        true  // removeDuplicates
      );

      // Should keep "Booked" booking and remove "Waitlisted" due to better priority
      expect(result).toHaveLength(1);
      expect(result[0].booking_id).toBe('booking-2');
      expect(result[0].status).toBe('Booked');
    });

    it('should prioritize more recent updated_at when status is the same', async () => {
      const mockResponse = {
        items: [
          {
            bookingId: 'booking-1',
            status: 'Booked',
            createdAt: '2024-01-01T09:00:00Z',
            updatedAt: '2024-01-01T09:00:00Z', // Older update
            class: {
              id: 'class-123',
              name: 'Orange 60',
              startsAt: '2024-01-15T10:00:00Z',
            }
          },
          {
            bookingId: 'booking-2',
            status: 'Booked',
            createdAt: '2024-01-01T09:00:00Z',
            updatedAt: '2024-01-01T11:00:00Z', // More recent update
            class: {
              id: 'class-123', // Same class
              name: 'Orange 60',
              startsAt: '2024-01-15T10:00:00Z',
            }
          }
        ]
      };

      mockClient.workoutRequest.mockResolvedValue(mockResponse);

      const result = await bookingsApi.getBookingsNew(
        new Date('2024-01-01'), 
        new Date('2024-01-31'),
        true,
        true
      );

      // Should keep booking with more recent updated_at
      expect(result).toHaveLength(1);
      expect(result[0].booking_id).toBe('booking-2');
      expect(result[0].updated_at).toBe('2024-01-01T11:00:00Z');
    });

    it('should handle complex priority scenarios matching Python logic', async () => {
      const mockResponse = {
        items: [
          {
            bookingId: 'booking-cancelled',
            status: 'Cancelled',
            createdAt: '2024-01-01T09:00:00Z',
            updatedAt: '2024-01-01T09:00:00Z',
            class: {
              id: 'class-123',
              name: 'Orange 60',
              startsAt: '2024-01-15T10:00:00Z',
            }
          },
          {
            bookingId: 'booking-waitlisted',
            status: 'Waitlisted',
            createdAt: '2024-01-01T10:00:00Z',
            updatedAt: '2024-01-01T10:00:00Z',
            class: {
              id: 'class-123', // Same class
              name: 'Orange 60',
              startsAt: '2024-01-15T10:00:00Z',
            }
          },
          {
            bookingId: 'booking-confirmed',
            status: 'Confirmed',
            createdAt: '2024-01-01T11:00:00Z', // Most recent
            updatedAt: '2024-01-01T11:00:00Z', // Most recent
            class: {
              id: 'class-123', // Same class
              name: 'Orange 60',
              startsAt: '2024-01-15T10:00:00Z',
            }
          }
        ]
      };

      mockClient.workoutRequest.mockResolvedValue(mockResponse);

      const result = await bookingsApi.getBookingsNew(
        new Date('2024-01-01'), 
        new Date('2024-01-31'),
        true,
        true
      );

      // Should keep "Confirmed" (most recent timestamps) over others
      expect(result).toHaveLength(1);
      expect(result[0].booking_id).toBe('booking-confirmed');
      expect(result[0].status).toBe('Confirmed');
    });

    it('should not deduplicate bookings with different class_ids', async () => {
      const mockResponse = {
        items: [
          {
            bookingId: 'booking-1',
            status: 'Booked',
            createdAt: '2024-01-01T09:00:00Z',
            updatedAt: '2024-01-01T09:00:00Z',
            class: {
              id: 'class-123',
              name: 'Orange 60',
              startsAt: '2024-01-15T10:00:00Z',
            }
          },
          {
            bookingId: 'booking-2',
            status: 'Booked',
            createdAt: '2024-01-01T10:00:00Z',
            updatedAt: '2024-01-01T10:00:00Z',
            class: {
              id: 'class-456', // Different class
              name: 'Orange 90',
              startsAt: '2024-01-15T11:00:00Z',
            }
          }
        ]
      };

      mockClient.workoutRequest.mockResolvedValue(mockResponse);

      const result = await bookingsApi.getBookingsNew(
        new Date('2024-01-01'), 
        new Date('2024-01-31'),
        true,
        true
      );

      // Should keep both bookings since they're for different classes
      expect(result).toHaveLength(2);
    });

    it('should respect removeDuplicates parameter', async () => {
      const mockResponse = {
        items: [
          {
            bookingId: 'booking-1',
            status: 'Waitlisted',
            createdAt: '2024-01-01T09:00:00Z',
            updatedAt: '2024-01-01T09:00:00Z',
            class: {
              id: 'class-123',
              name: 'Orange 60',
              startsAt: '2024-01-15T10:00:00Z',
            }
          },
          {
            bookingId: 'booking-2',
            status: 'Booked',
            createdAt: '2024-01-01T10:00:00Z',
            updatedAt: '2024-01-01T10:00:00Z',
            class: {
              id: 'class-123', // Same class
              name: 'Orange 60',
              startsAt: '2024-01-15T10:00:00Z',
            }
          }
        ]
      };

      mockClient.workoutRequest.mockResolvedValue(mockResponse);

      const result = await bookingsApi.getBookingsNew(
        new Date('2024-01-01'), 
        new Date('2024-01-31'),
        true,
        false // Don't remove duplicates
      );

      // Should keep both bookings since removeDuplicates = false
      expect(result).toHaveLength(2);
    });

    it('should handle bookings without class_id gracefully', async () => {
      const mockResponse = {
        items: [
          {
            bookingId: 'booking-1',
            status: 'Booked',
            createdAt: '2024-01-01T09:00:00Z',
            updatedAt: '2024-01-01T09:00:00Z',
            class: {
              // Missing classId
              name: 'Orange 60',
              startsAt: '2024-01-15T10:00:00Z',
            }
          },
          {
            bookingId: 'booking-2',
            status: 'Booked',
            createdAt: '2024-01-01T10:00:00Z',
            updatedAt: '2024-01-01T10:00:00Z',
            class: {
              id: 'class-123',
              name: 'Orange 60',
              startsAt: '2024-01-15T10:00:00Z',
            }
          }
        ]
      };

      mockClient.workoutRequest.mockResolvedValue(mockResponse);

      const result = await bookingsApi.getBookingsNew(
        new Date('2024-01-01'), 
        new Date('2024-01-31'),
        true,
        true
      );

      // Should keep the booking with class_id, skip the one without
      expect(result).toHaveLength(1);
      expect(result[0].booking_id).toBe('booking-2');
    });
  });
});
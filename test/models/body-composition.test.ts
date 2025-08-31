import { describe, it, expect } from 'vitest';
import {
  BodyCompositionData,
  convertKgToLbs,
  parseDividersString,
  getBodyFatPercentDividers,
  getBodyFatPercentDividersMale,
  getBodyFatPercentDividersFemale,
  getPercentBodyFatDescriptor,
  getRelativeDescriptor,
  AverageType,
  BodyFatPercentIndicator,
  DEFAULT_WEIGHT_DIVIDERS,
  DEFAULT_SKELETAL_MUSCLE_MASS_DIVIDERS,
  DEFAULT_BODY_FAT_MASS_DIVIDERS
} from '../../src/models/body-composition';

describe('Body Composition Business Logic', () => {
  describe('convertKgToLbs', () => {
    it('should convert kg to lbs using exact conversion factor', () => {
      const weightKg = 70.0;
      const expectedLbs = 70.0 * 2.20462262185;
      
      const result = convertKgToLbs(weightKg);
      
      expect(Math.abs(result - expectedLbs)).toBeLessThan(0.01);
      expect(result).toBeCloseTo(154.32, 2);
    });

    it('should handle zero weight', () => {
      expect(convertKgToLbs(0)).toBe(0);
    });

    it('should handle decimal weights', () => {
      expect(convertKgToLbs(75.5)).toBeCloseTo(166.45, 2);
    });
  });

  describe('parseDividersString', () => {
    it('should parse semicolon-separated strings correctly', () => {
      const dividersStr = '40.5;60.2;80.8;100.1;160.5;220.0;280.5';
      const expected = [40.5, 60.2, 80.8, 100.1, 160.5, 220.0, 280.5];
      
      const result = parseDividersString(dividersStr);
      
      expect(result).toEqual(expected);
    });

    it('should handle empty string gracefully', () => {
      expect(parseDividersString('')).toEqual([]);
      expect(parseDividersString('   ')).toEqual([]);
    });

    it('should handle strings with empty parts', () => {
      const result = parseDividersString('40.0;;60.0;');
      expect(result).toEqual([40.0, 60.0]);
    });

    it('should handle invalid numbers gracefully', () => {
      expect(parseDividersString('40.0;invalid;60.0')).toEqual([]);
    });

    it('should handle strings with extra whitespace', () => {
      const result = parseDividersString(' 40.0 ; 60.0 ; 80.0 ');
      expect(result).toEqual([40.0, 60.0, 80.0]);
    });
  });

  describe('age and gender body fat calculations', () => {
    describe('getBodyFatPercentDividersMale', () => {
      it('should return correct dividers for different age ranges', () => {
        expect(getBodyFatPercentDividersMale(25)).toEqual([0.0, 13.1, 21.1, 100.0]); // 0-30
        expect(getBodyFatPercentDividersMale(35)).toEqual([0.0, 17.1, 23.1, 100.0]); // 30-40
        expect(getBodyFatPercentDividersMale(45)).toEqual([0.0, 20.1, 25.1, 100.0]); // 40-50
        expect(getBodyFatPercentDividersMale(55)).toEqual([0.0, 21.1, 26.1, 100.0]); // 50-60
        expect(getBodyFatPercentDividersMale(65)).toEqual([0.0, 22.1, 27.1, 100.0]); // 60-70
        expect(getBodyFatPercentDividersMale(75)).toEqual([0.0, 0.0, 0.0, 0.0]);      // >70
      });

      it('should handle edge cases', () => {
        expect(getBodyFatPercentDividersMale(0)).toEqual([0.0, 13.1, 21.1, 100.0]);
        expect(getBodyFatPercentDividersMale(29)).toEqual([0.0, 13.1, 21.1, 100.0]);
        expect(getBodyFatPercentDividersMale(30)).toEqual([0.0, 17.1, 23.1, 100.0]);
        expect(getBodyFatPercentDividersMale(69)).toEqual([0.0, 22.1, 27.1, 100.0]);
        expect(getBodyFatPercentDividersMale(70)).toEqual([0.0, 0.0, 0.0, 0.0]);
      });
    });

    describe('getBodyFatPercentDividersFemale', () => {
      it('should return correct dividers for different age ranges', () => {
        expect(getBodyFatPercentDividersFemale(25)).toEqual([0.0, 19.1, 26.1, 100.0]); // 0-30
        expect(getBodyFatPercentDividersFemale(35)).toEqual([0.0, 20.1, 27.1, 100.0]); // 30-40
        expect(getBodyFatPercentDividersFemale(45)).toEqual([0.0, 22.1, 30.1, 100.0]); // 40-50
        expect(getBodyFatPercentDividersFemale(55)).toEqual([0.0, 25.1, 32.1, 100.0]); // 50-60
        expect(getBodyFatPercentDividersFemale(65)).toEqual([0.0, 26.1, 33.1, 100.0]); // 60-70
        expect(getBodyFatPercentDividersFemale(75)).toEqual([0.0, 0.0, 0.0, 0.0]);      // >70
      });

      it('should handle edge cases', () => {
        expect(getBodyFatPercentDividersFemale(0)).toEqual([0.0, 19.1, 26.1, 100.0]);
        expect(getBodyFatPercentDividersFemale(29)).toEqual([0.0, 19.1, 26.1, 100.0]);
        expect(getBodyFatPercentDividersFemale(30)).toEqual([0.0, 20.1, 27.1, 100.0]);
        expect(getBodyFatPercentDividersFemale(69)).toEqual([0.0, 26.1, 33.1, 100.0]);
        expect(getBodyFatPercentDividersFemale(70)).toEqual([0.0, 0.0, 0.0, 0.0]);
      });
    });

    describe('getBodyFatPercentDividers', () => {
      it('should select correct gender-specific function', () => {
        expect(getBodyFatPercentDividers(30, 'M')).toEqual([0.0, 17.1, 23.1, 100.0]);
        expect(getBodyFatPercentDividers(30, 'F')).toEqual([0.0, 20.1, 27.1, 100.0]);
      });
    });
  });

  describe('body fat percent descriptors', () => {
    it('should return correct descriptors based on ranges', () => {
      const dividers = [0.0, 20.0, 28.0, 100.0];
      
      // Test healthy range
      expect(getPercentBodyFatDescriptor(15.0, dividers)).toBe(BodyFatPercentIndicator.HEALTHY_BODY_FAT);
      
      // Test goal setting range  
      expect(getPercentBodyFatDescriptor(25.0, dividers)).toBe(BodyFatPercentIndicator.GOAL_SETTING_FAT);
      
      // Test high body fat
      expect(getPercentBodyFatDescriptor(35.0, dividers)).toBe(BodyFatPercentIndicator.HIGH_BODY_FAT);
      
      // Test edge cases
      expect(getPercentBodyFatDescriptor(0, dividers)).toBe(BodyFatPercentIndicator.NO_INDICATOR);
      expect(getPercentBodyFatDescriptor(25.0, [0, 0, 0, 0])).toBe(BodyFatPercentIndicator.NO_INDICATOR);
    });

    it('should handle boundary values correctly', () => {
      const dividers = [0.0, 20.0, 28.0, 100.0];
      
      expect(getPercentBodyFatDescriptor(19.9, dividers)).toBe(BodyFatPercentIndicator.HEALTHY_BODY_FAT);
      expect(getPercentBodyFatDescriptor(20.0, dividers)).toBe(BodyFatPercentIndicator.GOAL_SETTING_FAT);
      expect(getPercentBodyFatDescriptor(27.9, dividers)).toBe(BodyFatPercentIndicator.GOAL_SETTING_FAT);
      expect(getPercentBodyFatDescriptor(28.0, dividers)).toBe(BodyFatPercentIndicator.HIGH_BODY_FAT);
    });
  });

  describe('relative descriptors', () => {
    it('should return correct relative descriptors', () => {
      const dividers = [30.0, 50.0, 70.0, 90.0, 110.0, 130.0];
      
      // Test below average (≤ dividers[2])
      expect(getRelativeDescriptor(60.0, dividers)).toBe(AverageType.BELOW_AVERAGE);
      expect(getRelativeDescriptor(70.0, dividers)).toBe(AverageType.BELOW_AVERAGE);
      
      // Test average (≤ dividers[4])  
      expect(getRelativeDescriptor(85.0, dividers)).toBe(AverageType.AVERAGE);
      expect(getRelativeDescriptor(110.0, dividers)).toBe(AverageType.AVERAGE);
      
      // Test above average (> dividers[4])
      expect(getRelativeDescriptor(120.0, dividers)).toBe(AverageType.ABOVE_AVERAGE);
    });
  });

  describe('BodyCompositionData', () => {
    const mockApiData = {
      memberUUId: 'member123',
      memberId: '12345',
      scanResultUUId: 'scan123',
      id: 'test@example.com',
      email: 'test@example.com',
      height: '175',
      gender: 'M' as 'M',
      age: 30,
      testDatetime: '2024-01-15T10:00:00Z',
      weight: 180.0,  // provided weight in lbs
      tbw: 70.0,      // total body weight in kg - should be converted to lbs
      dlm: 50.0,
      bfm: 15.0,
      lbm: 55.0,
      smm: 40.0,
      bmi: 22.5,
      pbf: 12.5,
      bmr: 1800.0,
      inBodyType: 'Normal',
      bfmGraphScale: '40.0;60.0;80.0;100.0;160.0',
      smmGraphScale: '70.0;80.0;90.0;100.0;110.0',
      wtGraphScale: '55.0;70.0;85.0;100.0;115.0',
      pfatnew: 85.0,
      psmm: 105.0,
      pwt: 95.0,
      // Required nested data
      lbmOfLeftArm: 3.0,
      lbmOfLeftLeg: 8.0,
      lbmOfRightArm: 3.1,
      lbmOfRightLeg: 8.1,
      lbmOfTrunk: 25.0,
      lbmPercentOfLeftArm: 6.0,
      lbmPercentOfLeftLeg: 16.0,
      lbmPercentOfRightArm: 6.1,
      lbmPercentOfRightLeg: 16.1,
      lbmPercentOfTrunk: 50.0
    };

    it('should convert weight from kg to lbs during construction', () => {
      const bodyComp = new BodyCompositionData(mockApiData);
      
      const expectedLbs = 70.0 * 2.20462262185; // 70 kg to lbs
      expect(Math.abs(bodyComp.total_body_weight - expectedLbs)).toBeLessThan(0.01);
      expect(bodyComp.provided_weight).toBe(180.0); // Should remain unchanged
    });

    it('should parse divider strings correctly', () => {
      const complexData = {
        ...mockApiData,
        bfmGraphScale: '40.5;60.2;80.8;100.1;160.5;220.0;280.5',
        smmGraphScale: '70.1;80.2;90.3;100.4;110.5;120.6',
        wtGraphScale: '55.5;70.5;85.5;100.5;115.5;130.5;145.5;160.5'
      };
      
      const bodyComp = new BodyCompositionData(complexData);
      
      expect(bodyComp.body_fat_mass_dividers).toEqual([40.5, 60.2, 80.8, 100.1, 160.5, 220.0, 280.5]);
      expect(bodyComp.skeletal_muscle_mass_dividers).toEqual([70.1, 80.2, 90.3, 100.4, 110.5, 120.6]);
      expect(bodyComp.weight_dividers).toEqual([55.5, 70.5, 85.5, 100.5, 115.5, 130.5, 145.5, 160.5]);
    });

    it('should handle empty divider strings gracefully', () => {
      const emptyDividersData = {
        ...mockApiData,
        bfmGraphScale: '',
        smmGraphScale: '',
        wtGraphScale: ''
      };
      
      const bodyComp = new BodyCompositionData(emptyDividersData);
      
      expect(bodyComp.body_fat_mass_dividers).toEqual([]);
      expect(bodyComp.skeletal_muscle_mass_dividers).toEqual([]);
      expect(bodyComp.weight_dividers).toEqual([]);
    });

    it('should map all basic fields correctly', () => {
      const bodyComp = new BodyCompositionData(mockApiData);
      
      expect(bodyComp.member_uuid).toBe('member123');
      expect(bodyComp.member_id).toBe('12345');
      expect(bodyComp.scan_result_uuid).toBe('scan123');
      expect(bodyComp.inbody_id).toBe('test@example.com');
      expect(bodyComp.email).toBe('test@example.com');
      expect(bodyComp.height).toBe('175');
      expect(bodyComp.gender).toBe('M');
      expect(bodyComp.age).toBe(30);
      expect(bodyComp.scan_datetime).toBe('2024-01-15T02:00:00'); // Local format string
      expect(bodyComp.provided_weight).toBe(180.0);
      expect(bodyComp.dry_lean_mass).toBe(50.0);
      expect(bodyComp.body_fat_mass).toBe(15.0);
      expect(bodyComp.lean_body_mass).toBe(55.0);
      expect(bodyComp.skeletal_muscle_mass).toBe(40.0);
      expect(bodyComp.body_mass_index).toBe(22.5);
      expect(bodyComp.percent_body_fat).toBe(12.5);
      expect(bodyComp.basal_metabolic_rate).toBe(1800.0);
      expect(bodyComp.in_body_type).toBe('Normal');
    });

    it('should map nested lean body mass details correctly', () => {
      const bodyComp = new BodyCompositionData(mockApiData);
      
      expect(bodyComp.lean_body_mass_details).toEqual({
        left_arm: 3.0,
        left_leg: 8.0,
        right_arm: 3.1,
        right_leg: 8.1,
        trunk: 25.0
      });
      
      expect(bodyComp.lean_body_mass_percent_details).toEqual({
        left_arm: 6.0,
        left_leg: 16.0,
        right_arm: 6.1,
        right_leg: 16.1,
        trunk: 50.0
      });
    });

    it('should calculate relative descriptors correctly', () => {
      const testData = {
        ...mockApiData,
        gender: 'M' as 'M',
        age: 35,
        pbf: 15.5,  // Should be HEALTHY_BODY_FAT for 35yo male
        bfmGraphScale: '40.0;60.0;80.0;100.0;160.0',
        smmGraphScale: '70.0;80.0;90.0;100.0;110.0',
        wtGraphScale: '55.0;70.0;85.0;100.0;115.0',
        pfatnew: 75.0,  // Should be BELOW_AVERAGE (≤80)
        psmm: 105.0,    // Should be AVERAGE (≤110) 
        pwt: 95.0       // Should be AVERAGE (≤100)
      };
      
      const bodyComp = new BodyCompositionData(testData);
      
      expect(bodyComp.bodyFatMassRelativeDescriptor).toBe(AverageType.BELOW_AVERAGE);  // 75 ≤ 80 (dividers[2])
      expect(bodyComp.skeletalMuscleMassRelativeDescriptor).toBe(AverageType.AVERAGE); // 105 ≤ 110 (dividers[4])
      expect(bodyComp.weightRelativeDescriptor).toBe(AverageType.AVERAGE);             // 95 ≤ 100 (dividers[4])
      expect(bodyComp.bodyFatPercentRelativeDescriptor).toBe(BodyFatPercentIndicator.HEALTHY_BODY_FAT); // 15.5 < 17.1
    });

    it('should use default dividers when calculated properties use empty arrays', () => {
      const emptyDividersData = {
        ...mockApiData,
        bfmGraphScale: '',
        smmGraphScale: '',
        wtGraphScale: '',
        pfatnew: 85.0,
        psmm: 95.0,
        pwt: 80.0
      };
      
      const bodyComp = new BodyCompositionData(emptyDividersData);
      
      // Should fall back to default dividers for calculations
      expect(bodyComp.bodyFatMassRelativeDescriptor).toBe(AverageType.AVERAGE);  // 85 ≤ 100 (DEFAULT_BODY_FAT_MASS_DIVIDERS[4])
      expect(bodyComp.skeletalMuscleMassRelativeDescriptor).toBe(AverageType.AVERAGE); // 95 ≤ 110 (DEFAULT_SKELETAL_MUSCLE_MASS_DIVIDERS[4])
      expect(bodyComp.weightRelativeDescriptor).toBe(AverageType.BELOW_AVERAGE); // 80 ≤ 85 (DEFAULT_WEIGHT_DIVIDERS[2])
    });
  });

  describe('constants', () => {
    it('should have correct default dividers', () => {
      expect(DEFAULT_WEIGHT_DIVIDERS).toEqual([55.0, 70.0, 85.0, 100.0, 115.0, 130.0, 145.0, 160.0, 175.0, 190.0, 205.0]);
      expect(DEFAULT_SKELETAL_MUSCLE_MASS_DIVIDERS).toEqual([70.0, 80.0, 90.0, 100.0, 110.0, 120.0, 130.0, 140.0, 150.0, 160.0, 170.0]);
      expect(DEFAULT_BODY_FAT_MASS_DIVIDERS).toEqual([40.0, 60.0, 80.0, 100.0, 160.0, 220.0, 280.0, 340.0, 400.0, 460.0, 520.0]);
    });
  });
});
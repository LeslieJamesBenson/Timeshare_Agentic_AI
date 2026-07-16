// types.d.ts — the normalized credit-chart domain model.
//
// The engine is authored in JS (to match the repo's no-build-step stack) but
// these declarations document the contract validated at runtime by schema.js
// and are consumable by TypeScript tooling / editors.

export type ISODate = `${number}-${number}-${number}`;

export type DayOfWeek =
  | 'MONDAY' | 'TUESDAY' | 'WEDNESDAY' | 'THURSDAY'
  | 'FRIDAY' | 'SATURDAY' | 'SUNDAY';

export type WeeklyPricingStrategy =
  | 'nightly-only'
  | 'weekly-when-exactly-seven'
  | 'weekly-plus-extra-nights'
  | 'lowest-valid-rate'
  | 'resort-specific';

export interface SourceMetadata {
  sourceFile: string;
  sourcePointer?: string;
  effectiveYear?: number;
  effectiveStart?: ISODate;
  effectiveEnd?: ISODate;
  importedAt: string;
}

export interface UnitType {
  id: string;
  name: string;
  aliases?: string[];
  bedrooms?: number | null;
  maxOccupancy?: number | null;
  roomType?: string;
  viewType?: string;
  accessibilityType?: string;
}

export interface DateRange { start: ISODate; end: ISODate; }

export interface SeasonDefinition {
  id: string;
  name: string;
  meaning?: string;
  colorCode?: string;
  dateRanges: DateRange[];
  priority?: number;
}

export interface CreditRate {
  seasonId: string;
  unitTypeId: string;
  weekdayCredits?: number;
  weekendCredits?: number;
  nightlyCreditsByDay?: Partial<Record<DayOfWeek, number>>;
  weeklyCredits?: number;
  minimumStay?: number;
  maximumStay?: number;
}

export interface DateOverride {
  id: string;
  name: string;
  start: ISODate;
  end: ISODate;
  unitTypeId?: string;
  nightlyCredits?: number;
  nightlyCreditsByDay?: Partial<Record<DayOfWeek, number>>;
  weeklyCredits?: number;
  priority: number;
}

export interface ResortRules {
  weekendNights: DayOfWeek[];
  daySpecificNights?: DayOfWeek[];
  weeklyPricingStrategy: WeeklyPricingStrategy;
  weeklyRequiresSingleSeason?: boolean;
  fixedCheckInDays?: DayOfWeek[];
  minimumStay?: number;
  maximumStay?: number;
  useCheckInSeasonForEntireStay?: boolean;
  allowSplitSeasonCalculation?: boolean;
}

export interface NormalizedResortChart {
  resortId: string;
  resortName: string;
  destination?: string;
  region?: string;
  country?: string;
  state?: string;
  timezone: string;
  unitTypes: UnitType[];
  seasons: SeasonDefinition[];
  creditRates: CreditRate[];
  dateOverrides?: DateOverride[];
  rules: ResortRules;
  source: SourceMetadata;
}

export interface StayRequest {
  resortId: string;
  unitTypeId: string;
  checkIn: ISODate;
  checkOut: ISODate;
  roomCount?: number;
}

export interface NightCalculation {
  date: ISODate;
  dayOfWeek: DayOfWeek;
  seasonId: string;
  seasonName: string;
  dayType: 'weekday' | 'weekend' | 'custom';
  baseCredits: number;
  roomCount: number;
  totalCredits: number;
  inWeeklyBlock?: boolean;
  pricingSource:
    | 'weekday-rate' | 'weekend-rate' | 'day-specific-rate'
    | 'date-override' | 'weekly-allocation';
  sourceDescription?: string;
}

export interface WeeklyAdjustment {
  startDate: ISODate;
  endDate: ISODate;
  unitTypeId: string;
  seasonId: string;
  nightlySubtotal: number;
  weeklyRate: number;
  appliedCredits: number;
  savings: number;
  strategy: WeeklyPricingStrategy;
}

export interface StayCalculation {
  resortId: string;
  resortName: string;
  unitTypeId: string;
  unitTypeName: string;
  checkIn: ISODate;
  checkOut: ISODate;
  nightCount: number;
  roomCount: number;
  nights: NightCalculation[];
  nightlySubtotal: number;
  weeklyAdjustments: WeeklyAdjustment[];
  weeklySavings: number;
  totalCredits: number;
  warnings: string[];
}

export type ValidationSeverity = 'error' | 'warning' | 'info';

export interface ValidationIssue {
  severity: ValidationSeverity;
  code: string;
  message: string;
}

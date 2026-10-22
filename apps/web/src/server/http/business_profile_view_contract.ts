import type { BusinessProfileResult } from '../application/use-cases/business-profile/get_business_profile_use_case';
import type { OnboardingStateEntity } from '../domain/onboarding/onboarding';
import type { ProfileScanEntity } from '../domain/onboarding/profile_scan';
import type { FirstTask } from '../domain/onboarding/first_task_catalog';
import type { BusinessProfileResultView } from '@/shared/business_profile_view';
import type {
  OnboardingStateEntity as OnboardingView,
  FirstTaskView,
} from '@/shared/onboarding_view';
import type { ProfileScanEntity as ScanView } from '@/shared/scan_view';
type AssertAssignable<Sub extends Super, Super> = Sub;
export type BusinessProfileContract = AssertAssignable<
  BusinessProfileResult,
  BusinessProfileResultView
>;
export type OnboardingContract = AssertAssignable<OnboardingStateEntity, OnboardingView>;
export type ScanContract = AssertAssignable<ProfileScanEntity, ScanView>;
export type FirstTaskContract = AssertAssignable<FirstTask, FirstTaskView>;

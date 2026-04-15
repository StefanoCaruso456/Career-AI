import type { ArtifactParsingStatus } from "@/packages/contracts/src";

export type SchemaFamily = "workday" | "greenhouse" | "stripe";
export type ApplicationProfileKey =
  | "workday_profile"
  | "greenhouse_profile"
  | "stripe_profile";
export type WizardStepId =
  | "basic-profile"
  | "resume-experience"
  | "work-eligibility"
  | "compliance"
  | "review-save";

export type ResumeAssetReference = {
  artifactId: string;
  fileName: string;
  mimeType: string;
  parsingStatus: ArtifactParsingStatus;
  uploadedAt: string;
};

export type WorkExperienceEntry = {
  job_title: string;
  company: string;
  location: string;
  from_date: string;
  to_date: string;
};

export type EducationEntry = {
  school_or_university: string;
  degree: string;
};

export type WorkdayProfile = {
  email: string;
  password: string;
  verify_password: string;
  agreed_to_terms: boolean;
  application_source: string;
  worked_for_employer_before: string;
  worked_for_employer_before_capacity: string[];
  worked_for_ibm_or_subsidiary_before: string;
  worked_for_samsung_or_affiliates_before: string;
  provided_services_to_samsung_as_contingent_worker_or_contractor: string;
  country_territory: string;
  first_name: string;
  last_name: string;
  address_line_1: string;
  city: string;
  state_region: string;
  postal_code: string;
  phone_device_type: string;
  country_phone_code: string;
  phone_number: string;
  work_experience: WorkExperienceEntry[];
  education: EducationEntry[];
  resume_cv_file: ResumeAssetReference | null;
  legally_authorized_to_work: string;
  unrestricted_right_to_work: string;
  proof_of_legal_right_to_work_i9_acknowledgment: string;
  legal_work_age: string;
  is_at_least_18_or_has_valid_age_certificate: string;
  can_provide_identity_and_work_authorization_documents: string;
  able_to_work_in_listed_location_or_relocate: string;
  holds_work_authorization_outside_current_location: string;
  requires_work_authorization_in_position_country: string;
  valid_work_permit_for_position_country: string;
  valid_residency_permit_for_position_country: string;
  visa_sponsorship_required: string;
  locations_or_countries_requiring_hpe_sponsorship: string;
  willing_to_relocate: string;
  willingness_to_travel: string;
  can_perform_essential_functions_with_or_without_accommodation: string;
  willing_to_submit_background_check: string;
  talent_community_opt_in: string;
  preferred_recruitment_communication_method: string;
  retain_application_for_future_opportunities: string;
  screenshot_capture_consent: string;
  candidate_information_accuracy_attestation: string;
  terms_and_conditions_agreement: boolean;
  samsung_personal_information_consent: string;
  relevant_years_of_experience: string;
  has_non_compete_or_restriction: string;
  subject_to_non_compete_or_restrictive_covenant: string;
  signed_or_accepted_non_compete_or_related_restrictions: string;
  worked_on_employer_project_last_24_months: string;
  current_or_recent_employer_relationship_with_dell: string;
  current_employer_is_dell_reseller: string;
  interacts_with_dell_personnel_for_employer_services: string;
  dell_personnel_on_site_at_employer: string;
  job_in_canada: string;
  pay_and_benefits_expectations: string;
  uses_or_works_on_workday_system_in_current_job: string;
  related_to_current_workday_employee: string;
  related_to_customer_employee_or_government_official_with_direct_business_interactions: string;
  current_or_recent_employee_or_partner_of_workday_auditor_ernst_young: string;
  us_government_or_public_institution_employment_experience: string;
  government_employment_last_5_years: string;
  government_official_or_government_entity_relationship: string;
  government_responsibilities_conflict_with_employer: string;
  government_or_public_body_with_regulatory_authority_over_hpe: string;
  family_or_close_contact_with_government_official: string;
  family_or_close_personal_relationship_hpe_or_government_official: string;
  personal_relationship_with_samsung_employee: string;
  special_government_employee_status: string;
  post_government_employment_restrictions_attestation: string;
  debarred_or_suspended_by_federal_agency: string;
  conflict_of_interest_disclosure: string;
  ai_interview_assistance_acknowledgment: string;
  ai_recruiting_process_acknowledgment: string;
  citizenships: string;
  restricted_country_citizenship_or_status: string;
  export_control_restricted_country_status: string;
  ethnicity: string;
  gender: string;
  protected_veteran_status: string;
  language: string;
  self_identify_name: string;
  self_identify_date: string;
  disability_self_identification: string;
};

export type GreenhouseProfile = {
  first_name: string;
  last_name: string;
  email: string;
  country: string;
  phone_number: string;
  location_city: string;
  resume_cv_file: ResumeAssetReference | null;
  why_do_you_want_to_join_company: string;
  intended_work_location: string;
  legally_authorized_to_work: string;
  worked_for_employer_before: string;
  gender: string;
  is_hispanic_latino: string;
  veteran_status: string;
  disability_status: string;
};

export type StripeProfile = {
  first_name: string;
  last_name: string;
  email: string;
  country: string;
  phone_number: string;
  location_city: string;
  resume_cv_file: ResumeAssetReference | null;
  current_country_of_residence: string;
  anticipated_work_countries: string[];
  authorized_to_work_in_selected_locations: string;
  requires_stripe_work_permit_sponsorship: string;
  based_in_us_or_willing_to_relocate_to_us: string;
  plans_to_work_remotely: string;
  worked_for_stripe_or_affiliate_before: string;
  anticipated_work_location_for_role: string;
  current_or_previous_job_title: string;
  current_or_previous_employer: string;
  most_recent_degree_obtained: string;
  most_recent_school_attended: string;
  opt_in_whatsapp_recruiting: string;
  years_of_full_time_industry_experience: string;
  highest_level_of_education_completed: string;
  us_city_and_state_of_residence: string;
  gender: string;
  is_hispanic_latino: string;
  veteran_status: string;
  disability_status: string;
};

export type AnyApplicationProfile =
  | WorkdayProfile
  | GreenhouseProfile
  | StripeProfile;

export type ApplicationProfiles = {
  workday_profile: WorkdayProfile;
  greenhouse_profile: GreenhouseProfile;
  stripe_profile: StripeProfile;
};

export type SelectOption = {
  description?: string;
  label: string;
  value: string;
};

export type VisibilityRule = {
  equals?: boolean | string;
  field: string;
  includes?: string;
  notEquals?: boolean | string;
};

export type RepeatableFieldDefinition = {
  helperText?: string;
  key: string;
  label: string;
  options?: SelectOption[];
  placeholder?: string;
  required?: boolean;
  type: "date" | "email" | "phone" | "select" | "text" | "textarea";
};

export type RepeatableGroupDefinition = {
  addLabel: string;
  createEmptyItem: () => Record<string, string>;
  entryLabel: string;
  fields: RepeatableFieldDefinition[];
  minItems?: number;
};

export type FieldDefinition = {
  family: SchemaFamily | "shared";
  helperText?: string;
  inputType?: "password" | "text";
  key: string;
  label: string;
  options?: SelectOption[];
  placeholder?: string;
  readOnly?: boolean;
  repeatable?: RepeatableGroupDefinition;
  required?: boolean;
  reviewLabel?: string;
  rows?: number;
  sectionId: string;
  stepId: WizardStepId;
  type:
    | "checkbox"
    | "checkboxGroup"
    | "email"
    | "file"
    | "phone"
    | "radio"
    | "repeatable"
    | "select"
    | "text"
    | "textarea";
  visibleWhen?: VisibilityRule;
};

export type SectionDefinition = {
  description: string;
  fields: string[];
  id: string;
  stepId: WizardStepId;
  title: string;
  tone?: "default" | "optional";
};

export type WizardStepDefinition = {
  description: string;
  id: WizardStepId;
  title: string;
};

export type SchemaFamilyConfig = {
  family: SchemaFamily;
  fields: FieldDefinition[];
  heroCopy: string;
  label: string;
  profileKey: ApplicationProfileKey;
  sections: SectionDefinition[];
};

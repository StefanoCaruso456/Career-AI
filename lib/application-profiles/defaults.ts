import type {
  AnyApplicationProfile,
  ApplicationProfileKey,
  ApplicationProfiles,
  EducationEntry,
  GreenhouseProfile,
  ResumeAssetReference,
  SchemaFamily,
  StripeProfile,
  WorkExperienceEntry,
  WorkdayProfile,
} from "./types";

export const defaultWorkExperienceEntry: WorkExperienceEntry = {
  company: "",
  from_date: "",
  job_title: "",
  location: "",
  to_date: "",
};

export const defaultEducationEntry: EducationEntry = {
  degree: "",
  school_or_university: "",
};

export const defaultWorkdayProfile: WorkdayProfile = {
  able_to_work_in_listed_location_or_relocate: "",
  address_line_1: "",
  agreed_to_terms: true,
  ai_interview_assistance_acknowledgment: "",
  ai_recruiting_process_acknowledgment: "",
  application_source: "",
  can_perform_essential_functions_with_or_without_accommodation: "",
  can_provide_identity_and_work_authorization_documents: "",
  candidate_information_accuracy_attestation: "",
  citizenships: "",
  city: "",
  conflict_of_interest_disclosure: "",
  country_phone_code: "",
  country_territory: "",
  current_employer_is_dell_reseller: "",
  current_or_recent_employee_or_partner_of_workday_auditor_ernst_young: "",
  current_or_recent_employer_relationship_with_dell: "",
  debarred_or_suspended_by_federal_agency: "",
  dell_personnel_on_site_at_employer: "",
  disability_self_identification: "",
  education: [{ ...defaultEducationEntry }],
  email: "",
  ethnicity: "",
  export_control_restricted_country_status: "",
  family_or_close_contact_with_government_official: "",
  family_or_close_personal_relationship_hpe_or_government_official: "",
  first_name: "",
  gender: "",
  government_employment_last_5_years: "",
  government_official_or_government_entity_relationship: "",
  government_or_public_body_with_regulatory_authority_over_hpe: "",
  government_responsibilities_conflict_with_employer: "",
  has_non_compete_or_restriction: "",
  holds_work_authorization_outside_current_location: "",
  interacts_with_dell_personnel_for_employer_services: "",
  is_at_least_18_or_has_valid_age_certificate: "",
  job_in_canada: "",
  language: "",
  last_name: "",
  legally_authorized_to_work: "",
  legal_work_age: "",
  locations_or_countries_requiring_hpe_sponsorship: "",
  password: "",
  pay_and_benefits_expectations: "",
  personal_relationship_with_samsung_employee: "",
  phone_device_type: "",
  phone_number: "",
  postal_code: "",
  post_government_employment_restrictions_attestation: "",
  preferred_recruitment_communication_method: "",
  proof_of_legal_right_to_work_i9_acknowledgment: "",
  provided_services_to_samsung_as_contingent_worker_or_contractor: "",
  protected_veteran_status: "",
  related_to_current_workday_employee: "",
  related_to_customer_employee_or_government_official_with_direct_business_interactions: "",
  relevant_years_of_experience: "",
  requires_work_authorization_in_position_country: "",
  restricted_country_citizenship_or_status: "",
  retain_application_for_future_opportunities: "",
  resume_cv_file: null,
  samsung_personal_information_consent: "",
  screenshot_capture_consent: "",
  self_identify_date: "",
  self_identify_name: "",
  signed_or_accepted_non_compete_or_related_restrictions: "",
  special_government_employee_status: "",
  state_region: "",
  subject_to_non_compete_or_restrictive_covenant: "",
  talent_community_opt_in: "",
  terms_and_conditions_agreement: true,
  unrestricted_right_to_work: "",
  us_government_or_public_institution_employment_experience: "",
  uses_or_works_on_workday_system_in_current_job: "",
  valid_residency_permit_for_position_country: "",
  valid_work_permit_for_position_country: "",
  verify_password: "",
  visa_sponsorship_required: "",
  willing_to_relocate: "",
  willing_to_submit_background_check: "",
  willingness_to_travel: "",
  work_experience: [{ ...defaultWorkExperienceEntry }],
  worked_for_employer_before: "",
  worked_for_employer_before_capacity: [],
  worked_for_ibm_or_subsidiary_before: "",
  worked_for_samsung_or_affiliates_before: "",
  worked_on_employer_project_last_24_months: "",
};

export const defaultGreenhouseProfile: GreenhouseProfile = {
  country: "",
  disability_status: "",
  email: "",
  first_name: "",
  gender: "",
  intended_work_location: "",
  is_hispanic_latino: "",
  last_name: "",
  legally_authorized_to_work: "",
  location_city: "",
  phone_number: "",
  resume_cv_file: null,
  veteran_status: "",
  why_do_you_want_to_join_company: "",
  worked_for_employer_before: "",
};

export const defaultStripeProfile: StripeProfile = {
  anticipated_work_countries: [],
  anticipated_work_location_for_role: "",
  authorized_to_work_in_selected_locations: "",
  based_in_us_or_willing_to_relocate_to_us: "",
  country: "",
  current_country_of_residence: "",
  current_or_previous_employer: "",
  current_or_previous_job_title: "",
  disability_status: "",
  email: "",
  first_name: "",
  gender: "",
  highest_level_of_education_completed: "",
  is_hispanic_latino: "",
  last_name: "",
  location_city: "",
  most_recent_degree_obtained: "",
  most_recent_school_attended: "",
  opt_in_whatsapp_recruiting: "",
  phone_number: "",
  plans_to_work_remotely: "",
  requires_stripe_work_permit_sponsorship: "",
  resume_cv_file: null,
  us_city_and_state_of_residence: "",
  veteran_status: "",
  worked_for_stripe_or_affiliate_before: "",
  years_of_full_time_industry_experience: "",
};

export const defaultApplicationProfiles: ApplicationProfiles = {
  greenhouse_profile: { ...defaultGreenhouseProfile },
  stripe_profile: { ...defaultStripeProfile },
  workday_profile: { ...defaultWorkdayProfile },
};

const profileKeyBySchemaFamily: Record<SchemaFamily, ApplicationProfileKey> = {
  greenhouse: "greenhouse_profile",
  stripe: "stripe_profile",
  workday: "workday_profile",
};

const defaultProfilesBySchemaFamily: Record<SchemaFamily, AnyApplicationProfile> = {
  greenhouse: defaultGreenhouseProfile,
  stripe: defaultStripeProfile,
  workday: defaultWorkdayProfile,
};

function cloneValue<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function mergeResumeReference(value: unknown): ResumeAssetReference | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as ResumeAssetReference;

  if (!candidate.artifactId || !candidate.fileName) {
    return null;
  }

  return candidate;
}

function mergeWorkExperience(value: unknown) {
  if (!Array.isArray(value) || value.length === 0) {
    return [{ ...defaultWorkExperienceEntry }];
  }

  return value.map((entry) => ({
    ...defaultWorkExperienceEntry,
    ...(typeof entry === "object" && entry ? entry : {}),
  }));
}

function mergeEducation(value: unknown) {
  if (!Array.isArray(value) || value.length === 0) {
    return [{ ...defaultEducationEntry }];
  }

  return value.map((entry) => ({
    ...defaultEducationEntry,
    ...(typeof entry === "object" && entry ? entry : {}),
  }));
}

export function getApplicationProfileKey(schemaFamily: SchemaFamily): ApplicationProfileKey {
  return profileKeyBySchemaFamily[schemaFamily];
}

export function getDefaultProfileForFamily(schemaFamily: SchemaFamily): AnyApplicationProfile {
  return cloneValue(defaultProfilesBySchemaFamily[schemaFamily]);
}

export function mergeProfileWithDefaults(
  schemaFamily: SchemaFamily,
  value: Partial<AnyApplicationProfile> | null | undefined,
): AnyApplicationProfile {
  const defaults = getDefaultProfileForFamily(schemaFamily);
  const incoming = value && typeof value === "object" ? value : {};

  if (schemaFamily === "workday") {
    return {
      ...(defaults as WorkdayProfile),
      ...(incoming as Partial<WorkdayProfile>),
      education: mergeEducation((incoming as Partial<WorkdayProfile>).education),
      resume_cv_file: mergeResumeReference((incoming as Partial<WorkdayProfile>).resume_cv_file),
      work_experience: mergeWorkExperience(
        (incoming as Partial<WorkdayProfile>).work_experience,
      ),
      worked_for_employer_before_capacity: Array.isArray(
        (incoming as Partial<WorkdayProfile>).worked_for_employer_before_capacity,
      )
        ? [...((incoming as Partial<WorkdayProfile>).worked_for_employer_before_capacity ?? [])]
        : [],
    };
  }

  if (schemaFamily === "greenhouse") {
    return {
      ...(defaults as GreenhouseProfile),
      ...(incoming as Partial<GreenhouseProfile>),
      resume_cv_file: mergeResumeReference(
        (incoming as Partial<GreenhouseProfile>).resume_cv_file,
      ),
    };
  }

  return {
    ...(defaults as StripeProfile),
    ...(incoming as Partial<StripeProfile>),
    anticipated_work_countries: Array.isArray(
      (incoming as Partial<StripeProfile>).anticipated_work_countries,
    )
      ? [...((incoming as Partial<StripeProfile>).anticipated_work_countries ?? [])]
      : [],
    resume_cv_file: mergeResumeReference((incoming as Partial<StripeProfile>).resume_cv_file),
  };
}

export function mergeApplicationProfiles(
  value: Partial<ApplicationProfiles> | Record<string, unknown> | null | undefined,
): ApplicationProfiles {
  const candidate = value && typeof value === "object" ? value : {};

  return {
    greenhouse_profile: mergeProfileWithDefaults(
      "greenhouse",
      candidate.greenhouse_profile as Partial<GreenhouseProfile> | undefined,
    ) as GreenhouseProfile,
    stripe_profile: mergeProfileWithDefaults(
      "stripe",
      candidate.stripe_profile as Partial<StripeProfile> | undefined,
    ) as StripeProfile,
    workday_profile: mergeProfileWithDefaults(
      "workday",
      candidate.workday_profile as Partial<WorkdayProfile> | undefined,
    ) as WorkdayProfile,
  };
}

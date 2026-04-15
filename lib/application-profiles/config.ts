import {
  defaultEducationEntry,
  defaultWorkExperienceEntry,
  getApplicationProfileKey,
} from "./defaults";
import type {
  FieldDefinition,
  SchemaFamily,
  SchemaFamilyConfig,
  SectionDefinition,
  SelectOption,
  WizardStepDefinition,
} from "./types";

export const applicationProfileSteps: WizardStepDefinition[] = [
  {
    description: "The reusable basics we will carry into future applications.",
    id: "basic-profile",
    title: "Basic profile",
  },
  {
    description: "Attach the resume, work history, and education we can reuse later.",
    id: "resume-experience",
    title: "Resume + experience",
  },
  {
    description: "Capture authorization, sponsorship, and location readiness once.",
    id: "work-eligibility",
    title: "Work eligibility",
  },
  {
    description: "Keep employer disclosures and compliance answers organized.",
    id: "compliance",
    title: "Compliance + disclosures",
  },
  {
    description: "Review the saved profile before continuing into the application.",
    id: "review-save",
    title: "Review + save",
  },
];

const yesNoOptions: SelectOption[] = [
  { label: "Yes", value: "yes" },
  { label: "No", value: "no" },
];

const phoneDeviceOptions: SelectOption[] = [
  { label: "Mobile", value: "mobile" },
  { label: "Home", value: "home" },
  { label: "Work", value: "work" },
];

const communicationOptions: SelectOption[] = [
  { label: "Email", value: "email" },
  { label: "Phone", value: "phone" },
  { label: "Text message", value: "sms" },
  { label: "WhatsApp", value: "whatsapp" },
];

const relocationOptions: SelectOption[] = [
  { label: "Open to relocate", value: "yes" },
  { label: "Not open to relocate", value: "no" },
  { label: "Depends on role", value: "depends" },
];

const travelOptions: SelectOption[] = [
  { label: "No travel", value: "none" },
  { label: "Up to 25%", value: "up_to_25" },
  { label: "Up to 50%", value: "up_to_50" },
  { label: "Up to 75%", value: "up_to_75" },
  { label: "As needed", value: "as_needed" },
];

const employerCapacityOptions: SelectOption[] = [
  { label: "Employee", value: "employee" },
  { label: "Contractor", value: "contractor" },
  { label: "Intern", value: "intern" },
  { label: "Consultant", value: "consultant" },
];

const genderOptions: SelectOption[] = [
  { label: "Woman", value: "woman" },
  { label: "Man", value: "man" },
  { label: "Non-binary", value: "non_binary" },
  { label: "Prefer not to say", value: "prefer_not_to_say" },
];

const hispanicOptions: SelectOption[] = [
  { label: "Yes", value: "yes" },
  { label: "No", value: "no" },
  { label: "Prefer not to say", value: "prefer_not_to_say" },
];

const veteranOptions: SelectOption[] = [
  { label: "Protected veteran", value: "protected_veteran" },
  { label: "Not a protected veteran", value: "not_protected_veteran" },
  { label: "Prefer not to say", value: "prefer_not_to_say" },
];

const disabilityOptions: SelectOption[] = [
  { label: "Yes", value: "yes" },
  { label: "No", value: "no" },
  { label: "Prefer not to say", value: "prefer_not_to_say" },
];

const educationLevelOptions: SelectOption[] = [
  { label: "High school", value: "high_school" },
  { label: "Associate", value: "associate" },
  { label: "Bachelor's", value: "bachelors" },
  { label: "Master's", value: "masters" },
  { label: "Doctorate", value: "doctorate" },
  { label: "Other", value: "other" },
];

function textField(
  family: SchemaFamily | "shared",
  key: string,
  label: string,
  config: Partial<FieldDefinition> = {},
): FieldDefinition {
  return {
    family,
    key,
    label,
    required: true,
    sectionId: "basic-identity",
    stepId: "basic-profile",
    type: "text",
    ...config,
  };
}

function yesNoField(
  family: SchemaFamily | "shared",
  key: string,
  label: string,
  config: Partial<FieldDefinition> = {},
): FieldDefinition {
  return {
    family,
    key,
    label,
    options: yesNoOptions,
    required: true,
    sectionId: "work-authorization",
    stepId: "work-eligibility",
    type: "radio",
    ...config,
  };
}

const sharedFields: FieldDefinition[] = [
  textField("shared", "first_name", "First name", {
    placeholder: "Stefano",
  }),
  textField("shared", "last_name", "Last name", {
    placeholder: "Caruso",
  }),
  {
    family: "shared",
    key: "email",
    label: "Email",
    placeholder: "you@example.com",
    required: true,
    sectionId: "basic-identity",
    stepId: "basic-profile",
    type: "email",
  },
  {
    family: "shared",
    key: "phone_number",
    label: "Phone number",
    placeholder: "(312) 555-0188",
    required: true,
    sectionId: "contact-details",
    stepId: "basic-profile",
    type: "phone",
  },
  textField("shared", "country", "Country", {
    placeholder: "United States",
    sectionId: "contact-details",
  }),
  textField("shared", "country_territory", "Country / territory", {
    placeholder: "United States",
    sectionId: "contact-details",
  }),
  textField("shared", "city", "City", {
    placeholder: "Chicago",
    sectionId: "contact-details",
  }),
  textField("shared", "location_city", "City / location", {
    placeholder: "Chicago",
    sectionId: "contact-details",
  }),
  textField("shared", "address_line_1", "Address line 1", {
    placeholder: "1234 W Fulton St",
    sectionId: "address-details",
  }),
  textField("shared", "state_region", "State / region", {
    placeholder: "Illinois",
    sectionId: "address-details",
  }),
  textField("shared", "postal_code", "Postal code", {
    placeholder: "60607",
    sectionId: "address-details",
  }),
  {
    family: "shared",
    helperText: "Upload a PDF or Word document. We keep the saved resume reference for future applies.",
    key: "resume_cv_file",
    label: "Resume / CV",
    required: true,
    reviewLabel: "Resume",
    sectionId: "resume-upload",
    stepId: "resume-experience",
    type: "file",
  },
  {
    family: "shared",
    helperText: "Reusable timeline entries help future autofill stay accurate.",
    key: "work_experience",
    label: "Work experience",
    repeatable: {
      addLabel: "Add another role",
      createEmptyItem: () => ({ ...defaultWorkExperienceEntry }),
      entryLabel: "Role",
      fields: [
        {
          key: "job_title",
          label: "Job title",
          placeholder: "Senior Product Designer",
          required: true,
          type: "text",
        },
        {
          key: "company",
          label: "Company",
          placeholder: "Career AI",
          required: true,
          type: "text",
        },
        {
          key: "location",
          label: "Location",
          placeholder: "Remote",
          required: true,
          type: "text",
        },
        {
          key: "from_date",
          label: "From date",
          placeholder: "2022-01",
          required: true,
          type: "date",
        },
        {
          key: "to_date",
          label: "To date",
          placeholder: "2024-03",
          required: true,
          type: "date",
        },
      ],
      minItems: 1,
    },
    required: true,
    sectionId: "experience-history",
    stepId: "resume-experience",
    type: "repeatable",
  },
  {
    family: "shared",
    key: "education",
    label: "Education",
    repeatable: {
      addLabel: "Add another school",
      createEmptyItem: () => ({ ...defaultEducationEntry }),
      entryLabel: "Education entry",
      fields: [
        {
          key: "school_or_university",
          label: "School or university",
          placeholder: "University of Illinois",
          required: true,
          type: "text",
        },
        {
          key: "degree",
          label: "Degree",
          placeholder: "B.S. Computer Science",
          required: true,
          type: "text",
        },
      ],
      minItems: 1,
    },
    required: true,
    sectionId: "education-history",
    stepId: "resume-experience",
    type: "repeatable",
  },
];

const workdaySpecificFields: FieldDefinition[] = [
  {
    family: "workday",
    key: "password",
    label: "Workday password",
    helperText: "Some Workday employers reuse this when candidates create a hiring account.",
    inputType: "password",
    placeholder: "Create a password",
    required: true,
    sectionId: "basic-identity",
    stepId: "basic-profile",
    type: "text",
  },
  {
    family: "workday",
    key: "verify_password",
    label: "Verify password",
    inputType: "password",
    placeholder: "Re-enter your password",
    required: true,
    sectionId: "basic-identity",
    stepId: "basic-profile",
    type: "text",
  },
  {
    family: "workday",
    key: "agreed_to_terms",
    label: "I understand this saved profile can be reused for future applications",
    required: true,
    sectionId: "basic-identity",
    stepId: "basic-profile",
    type: "checkbox",
  },
  textField("workday", "application_source", "Application source", {
    helperText: "How should we describe the source when the employer asks?",
    placeholder: "Career AI",
    sectionId: "basic-identity",
  }),
  {
    family: "workday",
    key: "phone_device_type",
    label: "Phone device type",
    options: phoneDeviceOptions,
    required: true,
    sectionId: "contact-details",
    stepId: "basic-profile",
    type: "select",
  },
  textField("workday", "country_phone_code", "Country phone code", {
    placeholder: "+1",
    sectionId: "contact-details",
  }),
  textField("workday", "relevant_years_of_experience", "Relevant years of experience", {
    placeholder: "6",
    sectionId: "experience-history",
    stepId: "resume-experience",
  }),
  yesNoField("workday", "legally_authorized_to_work", "Are you legally authorized to work?"),
  yesNoField(
    "workday",
    "unrestricted_right_to_work",
    "Do you have unrestricted right to work?",
  ),
  yesNoField(
    "workday",
    "proof_of_legal_right_to_work_i9_acknowledgment",
    "Can you acknowledge I-9 or equivalent work-right documentation requirements?",
  ),
  yesNoField("workday", "legal_work_age", "Do you meet the legal work age requirement?"),
  yesNoField(
    "workday",
    "is_at_least_18_or_has_valid_age_certificate",
    "Are you at least 18 or able to provide a valid age certificate?",
  ),
  yesNoField(
    "workday",
    "can_provide_identity_and_work_authorization_documents",
    "Can you provide identity and work authorization documents if requested?",
  ),
  yesNoField(
    "workday",
    "able_to_work_in_listed_location_or_relocate",
    "Can you work in the listed location or relocate if needed?",
  ),
  yesNoField(
    "workday",
    "holds_work_authorization_outside_current_location",
    "Do you already hold work authorization outside your current location?",
  ),
  yesNoField(
    "workday",
    "requires_work_authorization_in_position_country",
    "Will you require work authorization in the position country?",
  ),
  yesNoField(
    "workday",
    "valid_work_permit_for_position_country",
    "Do you currently hold a valid work permit for the position country?",
  ),
  yesNoField(
    "workday",
    "valid_residency_permit_for_position_country",
    "Do you currently hold a valid residency permit for the position country?",
  ),
  yesNoField(
    "workday",
    "visa_sponsorship_required",
    "Will you need visa or immigration sponsorship?",
  ),
  {
    family: "workday",
    helperText: "Only complete when sponsorship is required in specific countries.",
    key: "locations_or_countries_requiring_hpe_sponsorship",
    label: "Locations or countries requiring sponsorship",
    placeholder: "United States, Canada",
    required: true,
    sectionId: "work-authorization",
    stepId: "work-eligibility",
    type: "textarea",
    visibleWhen: {
      equals: "yes",
      field: "visa_sponsorship_required",
    },
  },
  {
    family: "workday",
    key: "willing_to_relocate",
    label: "Relocation flexibility",
    options: relocationOptions,
    required: true,
    sectionId: "work-location",
    stepId: "work-eligibility",
    type: "select",
  },
  {
    family: "workday",
    key: "willingness_to_travel",
    label: "Travel willingness",
    options: travelOptions,
    required: true,
    sectionId: "work-location",
    stepId: "work-eligibility",
    type: "select",
  },
  yesNoField(
    "workday",
    "can_perform_essential_functions_with_or_without_accommodation",
    "Can you perform the essential functions of the role with or without accommodation?",
    { sectionId: "work-location" },
  ),
  yesNoField(
    "workday",
    "worked_for_employer_before",
    "Have you worked for this employer before?",
    {
      sectionId: "employer-history",
      stepId: "compliance",
    },
  ),
  {
    family: "workday",
    key: "worked_for_employer_before_capacity",
    label: "If yes, in what capacity?",
    options: employerCapacityOptions,
    required: true,
    sectionId: "employer-history",
    stepId: "compliance",
    type: "checkboxGroup",
    visibleWhen: {
      equals: "yes",
      field: "worked_for_employer_before",
    },
  },
  yesNoField(
    "workday",
    "worked_for_ibm_or_subsidiary_before",
    "Have you worked for IBM or one of its subsidiaries before?",
    {
      sectionId: "employer-history",
      stepId: "compliance",
    },
  ),
  yesNoField(
    "workday",
    "worked_for_samsung_or_affiliates_before",
    "Have you worked for Samsung or one of its affiliates before?",
    {
      sectionId: "employer-history",
      stepId: "compliance",
    },
  ),
  yesNoField(
    "workday",
    "provided_services_to_samsung_as_contingent_worker_or_contractor",
    "Have you provided services to Samsung as a contingent worker or contractor?",
    {
      sectionId: "employer-history",
      stepId: "compliance",
    },
  ),
  yesNoField(
    "workday",
    "willing_to_submit_background_check",
    "Are you willing to submit to a background check if required?",
    {
      sectionId: "candidate-consents",
      stepId: "compliance",
    },
  ),
  yesNoField(
    "workday",
    "talent_community_opt_in",
    "Can we keep you in the employer's talent community?",
    {
      sectionId: "candidate-consents",
      stepId: "compliance",
    },
  ),
  {
    family: "workday",
    key: "preferred_recruitment_communication_method",
    label: "Preferred recruitment communication method",
    options: communicationOptions,
    required: true,
    sectionId: "candidate-consents",
    stepId: "compliance",
    type: "select",
  },
  yesNoField(
    "workday",
    "retain_application_for_future_opportunities",
    "Can the employer retain this application for future opportunities?",
    {
      sectionId: "candidate-consents",
      stepId: "compliance",
    },
  ),
  yesNoField(
    "workday",
    "screenshot_capture_consent",
    "Do you consent to screenshot capture when required during apply automation?",
    {
      sectionId: "candidate-consents",
      stepId: "compliance",
    },
  ),
  yesNoField(
    "workday",
    "candidate_information_accuracy_attestation",
    "Do you attest that the information saved in this profile is accurate?",
    {
      sectionId: "candidate-consents",
      stepId: "compliance",
    },
  ),
  {
    family: "workday",
    key: "terms_and_conditions_agreement",
    label: "I agree to the employer's terms and conditions when this profile is used",
    required: true,
    sectionId: "candidate-consents",
    stepId: "compliance",
    type: "checkbox",
  },
  yesNoField(
    "workday",
    "samsung_personal_information_consent",
    "Do you consent to Samsung's personal information notice when required?",
    {
      sectionId: "candidate-consents",
      stepId: "compliance",
    },
  ),
  yesNoField(
    "workday",
    "has_non_compete_or_restriction",
    "Do you have any non-compete or employment restriction?",
    {
      sectionId: "restrictions",
      stepId: "compliance",
    },
  ),
  yesNoField(
    "workday",
    "subject_to_non_compete_or_restrictive_covenant",
    "Are you subject to a non-compete or restrictive covenant?",
    {
      sectionId: "restrictions",
      stepId: "compliance",
    },
  ),
  yesNoField(
    "workday",
    "signed_or_accepted_non_compete_or_related_restrictions",
    "Have you signed or accepted any related restrictions?",
    {
      sectionId: "restrictions",
      stepId: "compliance",
    },
  ),
  yesNoField(
    "workday",
    "worked_on_employer_project_last_24_months",
    "Have you worked on an employer project within the last 24 months?",
    {
      sectionId: "restrictions",
      stepId: "compliance",
    },
  ),
  yesNoField(
    "workday",
    "current_or_recent_employer_relationship_with_dell",
    "Does your current or recent employer have a relationship with Dell?",
    {
      sectionId: "restrictions",
      stepId: "compliance",
    },
  ),
  yesNoField(
    "workday",
    "current_employer_is_dell_reseller",
    "Is your current employer a Dell reseller?",
    {
      sectionId: "restrictions",
      stepId: "compliance",
    },
  ),
  yesNoField(
    "workday",
    "interacts_with_dell_personnel_for_employer_services",
    "Do you interact with Dell personnel for employer services?",
    {
      sectionId: "restrictions",
      stepId: "compliance",
    },
  ),
  yesNoField(
    "workday",
    "dell_personnel_on_site_at_employer",
    "Are Dell personnel on site at your employer?",
    {
      sectionId: "restrictions",
      stepId: "compliance",
    },
  ),
  yesNoField("workday", "job_in_canada", "Is this role located in Canada?", {
    sectionId: "work-location",
  }),
  {
    family: "workday",
    key: "pay_and_benefits_expectations",
    label: "Pay and benefits expectations",
    placeholder: "Target base salary or compensation expectations",
    required: true,
    sectionId: "work-location",
    stepId: "work-eligibility",
    type: "textarea",
  },
  yesNoField(
    "workday",
    "uses_or_works_on_workday_system_in_current_job",
    "Do you use or work on Workday systems in your current job?",
    {
      sectionId: "relationships",
      stepId: "compliance",
    },
  ),
  yesNoField(
    "workday",
    "related_to_current_workday_employee",
    "Are you related to a current Workday employee?",
    {
      sectionId: "relationships",
      stepId: "compliance",
    },
  ),
  yesNoField(
    "workday",
    "related_to_customer_employee_or_government_official_with_direct_business_interactions",
    "Do you have a close relationship with a customer employee or government official with direct business interactions?",
    {
      sectionId: "relationships",
      stepId: "compliance",
    },
  ),
  yesNoField(
    "workday",
    "current_or_recent_employee_or_partner_of_workday_auditor_ernst_young",
    "Are you a current or recent employee or partner of Ernst & Young or a similar auditor?",
    {
      sectionId: "relationships",
      stepId: "compliance",
    },
  ),
  yesNoField(
    "workday",
    "us_government_or_public_institution_employment_experience",
    "Have you worked for a US government or public institution?",
    {
      sectionId: "government-disclosures",
      stepId: "compliance",
    },
  ),
  yesNoField(
    "workday",
    "government_employment_last_5_years",
    "Have you held government employment in the last five years?",
    {
      sectionId: "government-disclosures",
      stepId: "compliance",
    },
  ),
  yesNoField(
    "workday",
    "government_official_or_government_entity_relationship",
    "Do you have any current relationship with a government official or entity?",
    {
      sectionId: "government-disclosures",
      stepId: "compliance",
    },
  ),
  yesNoField(
    "workday",
    "government_responsibilities_conflict_with_employer",
    "Do any government responsibilities conflict with the employer's business?",
    {
      sectionId: "government-disclosures",
      stepId: "compliance",
    },
  ),
  yesNoField(
    "workday",
    "government_or_public_body_with_regulatory_authority_over_hpe",
    "Are you connected to a government or public body with regulatory authority over the employer?",
    {
      sectionId: "government-disclosures",
      stepId: "compliance",
    },
  ),
  yesNoField(
    "workday",
    "family_or_close_contact_with_government_official",
    "Do you have a family or close contact with a government official?",
    {
      sectionId: "government-disclosures",
      stepId: "compliance",
    },
  ),
  yesNoField(
    "workday",
    "family_or_close_personal_relationship_hpe_or_government_official",
    "Do you have a close personal relationship with the employer or a government official relevant to the role?",
    {
      sectionId: "government-disclosures",
      stepId: "compliance",
    },
  ),
  yesNoField(
    "workday",
    "personal_relationship_with_samsung_employee",
    "Do you have a personal relationship with a Samsung employee relevant to this application?",
    {
      sectionId: "government-disclosures",
      stepId: "compliance",
    },
  ),
  yesNoField(
    "workday",
    "special_government_employee_status",
    "Do you hold special government employee status?",
    {
      sectionId: "government-disclosures",
      stepId: "compliance",
    },
  ),
  yesNoField(
    "workday",
    "post_government_employment_restrictions_attestation",
    "Do you acknowledge any post-government employment restrictions that apply?",
    {
      sectionId: "government-disclosures",
      stepId: "compliance",
    },
  ),
  yesNoField(
    "workday",
    "debarred_or_suspended_by_federal_agency",
    "Have you ever been debarred or suspended by a federal agency?",
    {
      sectionId: "government-disclosures",
      stepId: "compliance",
    },
  ),
  {
    family: "workday",
    key: "conflict_of_interest_disclosure",
    label: "Conflict of interest disclosure",
    placeholder: "Share any relationships, outside work, or restrictions we should preserve for employers.",
    required: true,
    sectionId: "disclosures",
    stepId: "compliance",
    type: "textarea",
  },
  yesNoField(
    "workday",
    "ai_interview_assistance_acknowledgment",
    "Can you acknowledge AI-assisted interview guidance policies when an employer asks?",
    {
      sectionId: "disclosures",
      stepId: "compliance",
    },
  ),
  yesNoField(
    "workday",
    "ai_recruiting_process_acknowledgment",
    "Can you acknowledge AI use disclosures in the recruiting process when required?",
    {
      sectionId: "disclosures",
      stepId: "compliance",
    },
  ),
  {
    family: "workday",
    key: "citizenships",
    label: "Citizenships",
    placeholder: "United States, Italy",
    required: true,
    sectionId: "export-controls",
    stepId: "compliance",
    type: "textarea",
  },
  yesNoField(
    "workday",
    "restricted_country_citizenship_or_status",
    "Do you hold citizenship or status connected to a restricted country?",
    {
      sectionId: "export-controls",
      stepId: "compliance",
    },
  ),
  yesNoField(
    "workday",
    "export_control_restricted_country_status",
    "Are you subject to any export-control restricted country status?",
    {
      sectionId: "export-controls",
      stepId: "compliance",
    },
  ),
  {
    family: "workday",
    key: "ethnicity",
    label: "Ethnicity",
    options: [
      { label: "Hispanic or Latino", value: "hispanic_or_latino" },
      { label: "Not Hispanic or Latino", value: "not_hispanic_or_latino" },
      { label: "Prefer not to say", value: "prefer_not_to_say" },
    ],
    required: false,
    sectionId: "self-identification",
    stepId: "compliance",
    type: "select",
  },
  {
    family: "workday",
    key: "gender",
    label: "Gender",
    options: genderOptions,
    required: false,
    sectionId: "self-identification",
    stepId: "compliance",
    type: "select",
  },
  {
    family: "workday",
    key: "protected_veteran_status",
    label: "Protected veteran status",
    options: veteranOptions,
    required: false,
    sectionId: "self-identification",
    stepId: "compliance",
    type: "select",
  },
  {
    family: "workday",
    key: "language",
    label: "Self-identification language",
    placeholder: "English",
    required: false,
    sectionId: "self-identification",
    stepId: "compliance",
    type: "text",
  },
  {
    family: "workday",
    key: "self_identify_name",
    label: "Self-identification signature name",
    placeholder: "Full legal name",
    required: false,
    sectionId: "self-identification",
    stepId: "compliance",
    type: "text",
  },
  {
    family: "workday",
    key: "self_identify_date",
    label: "Self-identification date",
    placeholder: "YYYY-MM-DD",
    required: false,
    sectionId: "self-identification",
    stepId: "compliance",
    type: "text",
  },
  {
    family: "workday",
    key: "disability_self_identification",
    label: "Disability self-identification",
    options: disabilityOptions,
    required: false,
    sectionId: "self-identification",
    stepId: "compliance",
    type: "select",
  },
];

const greenhouseSpecificFields: FieldDefinition[] = [
  textField("greenhouse", "why_do_you_want_to_join_company", "Why do you want to join the company?", {
    helperText: "We reuse this only on applications that ask for a short motivation statement.",
    placeholder: "I want to help build...",
    sectionId: "candidate-story",
    stepId: "resume-experience",
    type: "textarea",
  }),
  textField("greenhouse", "intended_work_location", "Intended work location", {
    placeholder: "Chicago, IL or Remote",
    sectionId: "candidate-story",
    stepId: "resume-experience",
  }),
  yesNoField(
    "greenhouse",
    "legally_authorized_to_work",
    "Are you legally authorized to work in the intended location?",
  ),
  yesNoField(
    "greenhouse",
    "worked_for_employer_before",
    "Have you worked for this employer before?",
    {
      sectionId: "greenhouse-disclosures",
      stepId: "compliance",
    },
  ),
  {
    family: "greenhouse",
    key: "gender",
    label: "Gender",
    options: genderOptions,
    required: false,
    sectionId: "self-identification",
    stepId: "compliance",
    type: "select",
  },
  {
    family: "greenhouse",
    key: "is_hispanic_latino",
    label: "Hispanic or Latino",
    options: hispanicOptions,
    required: false,
    sectionId: "self-identification",
    stepId: "compliance",
    type: "select",
  },
  {
    family: "greenhouse",
    key: "veteran_status",
    label: "Veteran status",
    options: veteranOptions,
    required: false,
    sectionId: "self-identification",
    stepId: "compliance",
    type: "select",
  },
  {
    family: "greenhouse",
    key: "disability_status",
    label: "Disability status",
    options: disabilityOptions,
    required: false,
    sectionId: "self-identification",
    stepId: "compliance",
    type: "select",
  },
];

const stripeSpecificFields: FieldDefinition[] = [
  textField("stripe", "current_country_of_residence", "Current country of residence", {
    placeholder: "United States",
    sectionId: "contact-details",
  }),
  {
    family: "stripe",
    key: "anticipated_work_countries",
    label: "Countries where you anticipate working",
    options: [
      { label: "United States", value: "us" },
      { label: "Canada", value: "ca" },
      { label: "United Kingdom", value: "uk" },
      { label: "Ireland", value: "ie" },
      { label: "Singapore", value: "sg" },
      { label: "Remote / varies", value: "remote" },
    ],
    required: true,
    sectionId: "work-location",
    stepId: "work-eligibility",
    type: "checkboxGroup",
  },
  yesNoField(
    "stripe",
    "authorized_to_work_in_selected_locations",
    "Are you authorized to work in the locations you selected?",
  ),
  yesNoField(
    "stripe",
    "requires_stripe_work_permit_sponsorship",
    "Will you require Stripe to provide work permit sponsorship?",
  ),
  yesNoField(
    "stripe",
    "based_in_us_or_willing_to_relocate_to_us",
    "Are you based in the US or willing to relocate there?",
    {
      sectionId: "work-location",
    },
  ),
  yesNoField("stripe", "plans_to_work_remotely", "Do you plan to work remotely?", {
    sectionId: "work-location",
  }),
  yesNoField(
    "stripe",
    "worked_for_stripe_or_affiliate_before",
    "Have you worked for Stripe or one of its affiliates before?",
    {
      sectionId: "stripe-disclosures",
      stepId: "compliance",
    },
  ),
  textField("stripe", "anticipated_work_location_for_role", "Anticipated work location for the role", {
    placeholder: "Chicago, IL",
    sectionId: "work-location",
    stepId: "work-eligibility",
  }),
  textField("stripe", "current_or_previous_job_title", "Current or previous job title", {
    placeholder: "Senior Software Engineer",
    sectionId: "experience-history",
    stepId: "resume-experience",
  }),
  textField("stripe", "current_or_previous_employer", "Current or previous employer", {
    placeholder: "Career AI",
    sectionId: "experience-history",
    stepId: "resume-experience",
  }),
  textField("stripe", "most_recent_degree_obtained", "Most recent degree obtained", {
    placeholder: "B.S. Computer Science",
    sectionId: "education-history",
    stepId: "resume-experience",
  }),
  textField("stripe", "most_recent_school_attended", "Most recent school attended", {
    placeholder: "Northwestern University",
    sectionId: "education-history",
    stepId: "resume-experience",
  }),
  yesNoField(
    "stripe",
    "opt_in_whatsapp_recruiting",
    "Would you like to opt into WhatsApp recruiting updates?",
    {
      sectionId: "stripe-disclosures",
      stepId: "compliance",
    },
  ),
  textField("stripe", "years_of_full_time_industry_experience", "Years of full-time industry experience", {
    placeholder: "7",
    sectionId: "experience-history",
    stepId: "resume-experience",
  }),
  {
    family: "stripe",
    key: "highest_level_of_education_completed",
    label: "Highest level of education completed",
    options: educationLevelOptions,
    required: true,
    sectionId: "education-history",
    stepId: "resume-experience",
    type: "select",
  },
  textField("stripe", "us_city_and_state_of_residence", "US city and state of residence", {
    placeholder: "Chicago, Illinois",
    sectionId: "work-location",
    stepId: "work-eligibility",
    visibleWhen: {
      equals: "yes",
      field: "based_in_us_or_willing_to_relocate_to_us",
    },
  }),
  {
    family: "stripe",
    key: "gender",
    label: "Gender",
    options: genderOptions,
    required: false,
    sectionId: "self-identification",
    stepId: "compliance",
    type: "select",
  },
  {
    family: "stripe",
    key: "is_hispanic_latino",
    label: "Hispanic or Latino",
    options: hispanicOptions,
    required: false,
    sectionId: "self-identification",
    stepId: "compliance",
    type: "select",
  },
  {
    family: "stripe",
    key: "veteran_status",
    label: "Veteran status",
    options: veteranOptions,
    required: false,
    sectionId: "self-identification",
    stepId: "compliance",
    type: "select",
  },
  {
    family: "stripe",
    key: "disability_status",
    label: "Disability status",
    options: disabilityOptions,
    required: false,
    sectionId: "self-identification",
    stepId: "compliance",
    type: "select",
  },
];

const workdaySections: SectionDefinition[] = [
  {
    description: "The account-level fields we can safely reuse every time Workday asks.",
    fields: [
      "first_name",
      "last_name",
      "email",
      "password",
      "verify_password",
      "application_source",
      "agreed_to_terms",
    ],
    id: "basic-identity",
    stepId: "basic-profile",
    title: "Basic profile",
  },
  {
    description: "Saved contact details let future applications stay one-click ready.",
    fields: [
      "country_territory",
      "city",
      "address_line_1",
      "state_region",
      "postal_code",
      "phone_device_type",
      "country_phone_code",
      "phone_number",
    ],
    id: "contact-details",
    stepId: "basic-profile",
    title: "Contact details",
  },
  {
    description: "Your reusable resume lives here so we can keep future applies fast.",
    fields: ["resume_cv_file"],
    id: "resume-upload",
    stepId: "resume-experience",
    title: "Resume",
  },
  {
    description: "Keep the last few roles structured instead of trapped inside a PDF.",
    fields: ["relevant_years_of_experience", "work_experience"],
    id: "experience-history",
    stepId: "resume-experience",
    title: "Experience",
  },
  {
    description: "Education is reusable too, so we keep it attached to your application profile.",
    fields: ["education"],
    id: "education-history",
    stepId: "resume-experience",
    title: "Education",
  },
  {
    description: "These are the answers that most often block or slow down Workday applications.",
    fields: [
      "legally_authorized_to_work",
      "unrestricted_right_to_work",
      "proof_of_legal_right_to_work_i9_acknowledgment",
      "legal_work_age",
      "is_at_least_18_or_has_valid_age_certificate",
      "can_provide_identity_and_work_authorization_documents",
      "able_to_work_in_listed_location_or_relocate",
      "holds_work_authorization_outside_current_location",
      "requires_work_authorization_in_position_country",
      "valid_work_permit_for_position_country",
      "valid_residency_permit_for_position_country",
      "visa_sponsorship_required",
      "locations_or_countries_requiring_hpe_sponsorship",
    ],
    id: "work-authorization",
    stepId: "work-eligibility",
    title: "Authorization + sponsorship",
  },
  {
    description: "Location, travel, and compensation expectations stay ready for future reuse.",
    fields: [
      "willing_to_relocate",
      "willingness_to_travel",
      "can_perform_essential_functions_with_or_without_accommodation",
      "job_in_canada",
      "pay_and_benefits_expectations",
    ],
    id: "work-location",
    stepId: "work-eligibility",
    title: "Location + logistics",
  },
  {
    description: "Employer-history questions vary, so we keep them grouped and explicit.",
    fields: [
      "worked_for_employer_before",
      "worked_for_employer_before_capacity",
      "worked_for_ibm_or_subsidiary_before",
      "worked_for_samsung_or_affiliates_before",
      "provided_services_to_samsung_as_contingent_worker_or_contractor",
    ],
    id: "employer-history",
    stepId: "compliance",
    title: "Employer history",
  },
  {
    description: "These answers help us reuse your profile without asking you the same consent questions twice.",
    fields: [
      "willing_to_submit_background_check",
      "talent_community_opt_in",
      "preferred_recruitment_communication_method",
      "retain_application_for_future_opportunities",
      "screenshot_capture_consent",
      "candidate_information_accuracy_attestation",
      "terms_and_conditions_agreement",
      "samsung_personal_information_consent",
    ],
    id: "candidate-consents",
    stepId: "compliance",
    title: "Consents",
  },
  {
    description: "Role restrictions and related-party questions are preserved here for future apply automation.",
    fields: [
      "has_non_compete_or_restriction",
      "subject_to_non_compete_or_restrictive_covenant",
      "signed_or_accepted_non_compete_or_related_restrictions",
      "worked_on_employer_project_last_24_months",
      "current_or_recent_employer_relationship_with_dell",
      "current_employer_is_dell_reseller",
      "interacts_with_dell_personnel_for_employer_services",
      "dell_personnel_on_site_at_employer",
    ],
    id: "restrictions",
    stepId: "compliance",
    title: "Restrictions",
  },
  {
    description: "Workday asks for a wide set of relationship disclosures, so we keep them in one reusable cluster.",
    fields: [
      "uses_or_works_on_workday_system_in_current_job",
      "related_to_current_workday_employee",
      "related_to_customer_employee_or_government_official_with_direct_business_interactions",
      "current_or_recent_employee_or_partner_of_workday_auditor_ernst_young",
    ],
    id: "relationships",
    stepId: "compliance",
    title: "Relationships",
  },
  {
    description: "Government and public-sector disclosures stay ready for employers that require them.",
    fields: [
      "us_government_or_public_institution_employment_experience",
      "government_employment_last_5_years",
      "government_official_or_government_entity_relationship",
      "government_responsibilities_conflict_with_employer",
      "government_or_public_body_with_regulatory_authority_over_hpe",
      "family_or_close_contact_with_government_official",
      "family_or_close_personal_relationship_hpe_or_government_official",
      "personal_relationship_with_samsung_employee",
      "special_government_employee_status",
      "post_government_employment_restrictions_attestation",
      "debarred_or_suspended_by_federal_agency",
    ],
    id: "government-disclosures",
    stepId: "compliance",
    title: "Government disclosures",
  },
  {
    description: "These freeform or policy acknowledgments are easier to review together.",
    fields: [
      "conflict_of_interest_disclosure",
      "ai_interview_assistance_acknowledgment",
      "ai_recruiting_process_acknowledgment",
    ],
    id: "disclosures",
    stepId: "compliance",
    title: "Disclosure notes",
  },
  {
    description: "Optional self-identification answers remain visually separate from the rest of the application profile.",
    fields: [
      "citizenships",
      "restricted_country_citizenship_or_status",
      "export_control_restricted_country_status",
      "ethnicity",
      "gender",
      "protected_veteran_status",
      "language",
      "self_identify_name",
      "self_identify_date",
      "disability_self_identification",
    ],
    id: "self-identification",
    stepId: "compliance",
    title: "Self-identification",
    tone: "optional",
  },
];

const greenhouseSections: SectionDefinition[] = [
  {
    description: "The shared basics we can reuse on most Greenhouse applications.",
    fields: [
      "first_name",
      "last_name",
      "email",
      "country",
      "phone_number",
      "location_city",
    ],
    id: "basic-identity",
    stepId: "basic-profile",
    title: "Basic profile",
  },
  {
    description: "Resume plus a short reusable motivation statement.",
    fields: [
      "resume_cv_file",
      "why_do_you_want_to_join_company",
      "intended_work_location",
    ],
    id: "candidate-story",
    stepId: "resume-experience",
    title: "Resume + story",
  },
  {
    description: "The work-authorized answer most Greenhouse boards require.",
    fields: ["legally_authorized_to_work"],
    id: "work-authorization",
    stepId: "work-eligibility",
    title: "Work eligibility",
  },
  {
    description: "Keep prior-employer and voluntary self-identification answers neatly separated.",
    fields: [
      "worked_for_employer_before",
      "gender",
      "is_hispanic_latino",
      "veteran_status",
      "disability_status",
    ],
    id: "self-identification",
    stepId: "compliance",
    title: "Compliance + self-identification",
    tone: "optional",
  },
];

const stripeSections: SectionDefinition[] = [
  {
    description: "The core identity details Stripe-like application flows reuse repeatedly.",
    fields: [
      "first_name",
      "last_name",
      "email",
      "country",
      "phone_number",
      "location_city",
      "current_country_of_residence",
    ],
    id: "basic-identity",
    stepId: "basic-profile",
    title: "Basic profile",
  },
  {
    description: "Resume, experience, and education are grouped together for faster later applies.",
    fields: [
      "resume_cv_file",
      "current_or_previous_job_title",
      "current_or_previous_employer",
      "years_of_full_time_industry_experience",
      "most_recent_degree_obtained",
      "most_recent_school_attended",
      "highest_level_of_education_completed",
    ],
    id: "experience-history",
    stepId: "resume-experience",
    title: "Resume + experience",
  },
  {
    description: "Location and sponsorship questions stay reusable across future Stripe applications.",
    fields: [
      "anticipated_work_countries",
      "authorized_to_work_in_selected_locations",
      "requires_stripe_work_permit_sponsorship",
      "based_in_us_or_willing_to_relocate_to_us",
      "plans_to_work_remotely",
      "anticipated_work_location_for_role",
      "us_city_and_state_of_residence",
    ],
    id: "work-location",
    stepId: "work-eligibility",
    title: "Location + authorization",
  },
  {
    description: "Employer disclosure and voluntary self-identification stay visually separate.",
    fields: [
      "worked_for_stripe_or_affiliate_before",
      "opt_in_whatsapp_recruiting",
      "gender",
      "is_hispanic_latino",
      "veteran_status",
      "disability_status",
    ],
    id: "self-identification",
    stepId: "compliance",
    title: "Compliance + self-identification",
    tone: "optional",
  },
];

export const schemaFamilyConfigs: Record<SchemaFamily, SchemaFamilyConfig> = {
  greenhouse: {
    family: "greenhouse",
    fields: [...sharedFields, ...greenhouseSpecificFields],
    heroCopy: "Save the shared Greenhouse-style answers once, then reuse them later with only employer-specific deltas when needed.",
    label: "Greenhouse profile",
    profileKey: getApplicationProfileKey("greenhouse"),
    sections: greenhouseSections,
  },
  stripe: {
    family: "stripe",
    fields: [...sharedFields, ...stripeSpecificFields],
    heroCopy: "Keep Stripe-specific location, sponsorship, and compliance answers reusable so future applications can move in one pass.",
    label: "Stripe profile",
    profileKey: getApplicationProfileKey("stripe"),
    sections: stripeSections,
  },
  workday: {
    family: "workday",
    fields: [...sharedFields, ...workdaySpecificFields],
    heroCopy: "Workday applications ask the broadest set of reusable questions, so we keep them organized once and ready for future one-click applies.",
    label: "Workday profile",
    profileKey: getApplicationProfileKey("workday"),
    sections: workdaySections,
  },
};

export function getSchemaFamilyConfig(schemaFamily: SchemaFamily): SchemaFamilyConfig {
  return schemaFamilyConfigs[schemaFamily];
}

export function getFieldDefinition(
  schemaFamily: SchemaFamily,
  fieldKey: string,
): FieldDefinition | undefined {
  return schemaFamilyConfigs[schemaFamily].fields.find((field) => field.key === fieldKey);
}

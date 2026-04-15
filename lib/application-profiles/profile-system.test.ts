import { describe, expect, it } from "vitest";
import { mergeProfileWithDefaults } from "@/lib/application-profiles/defaults";
import { resolveSchemaFamily } from "@/lib/application-profiles/resolver";
import { getMissingRequiredFieldKeys } from "@/lib/application-profiles/validation";

describe("application profile system", () => {
  it("detects schema families from hosted apply URLs", () => {
    expect(
      resolveSchemaFamily({
        applyUrl: "https://wd3.myworkdayjobs.com/en-US/External/job/Senior-Engineer",
      }),
    ).toBe("workday");

    expect(
      resolveSchemaFamily({
        applyUrl: "https://stripe.com/jobs/listing/software-engineer/12345",
        companyName: "Stripe",
      }),
    ).toBe("stripe");

    expect(
      resolveSchemaFamily({
        applyUrl: "https://boards.greenhouse.io/careerai/jobs/123456",
      }),
    ).toBe("greenhouse");
  });

  it("keeps the Samsung-required Workday fields in the missing-field set until they are filled", () => {
    const profile = mergeProfileWithDefaults("workday", {
      first_name: "Stefano",
      last_name: "Caruso",
    });
    const missingKeys = getMissingRequiredFieldKeys({
      fieldKeys: [
        "worked_for_samsung_or_affiliates_before",
        "provided_services_to_samsung_as_contingent_worker_or_contractor",
        "is_at_least_18_or_has_valid_age_certificate",
        "special_government_employee_status",
        "samsung_personal_information_consent",
        "willingness_to_travel",
        "can_perform_essential_functions_with_or_without_accommodation",
        "personal_relationship_with_samsung_employee",
        "pay_and_benefits_expectations",
      ],
      profile,
      schemaFamily: "workday",
    });

    expect([...missingKeys].sort()).toEqual([
      "can_perform_essential_functions_with_or_without_accommodation",
      "is_at_least_18_or_has_valid_age_certificate",
      "pay_and_benefits_expectations",
      "personal_relationship_with_samsung_employee",
      "provided_services_to_samsung_as_contingent_worker_or_contractor",
      "samsung_personal_information_consent",
      "special_government_employee_status",
      "willingness_to_travel",
      "worked_for_samsung_or_affiliates_before",
    ]);
  });
});

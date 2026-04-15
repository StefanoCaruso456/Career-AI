import { z } from "zod";
import { artifactParsingStatusSchema } from "./artifact";

export const schemaFamilySchema = z.enum(["workday", "greenhouse", "stripe"]);

export const applicationProfileRecordSchema = z.record(z.string(), z.unknown());

export const applicationProfilesSchema = z.object({
  greenhouse_profile: applicationProfileRecordSchema.optional(),
  stripe_profile: applicationProfileRecordSchema.optional(),
  workday_profile: applicationProfileRecordSchema.optional(),
});

export const resumeAssetReferenceSchema = z.object({
  artifactId: z.string(),
  fileName: z.string(),
  mimeType: z.string(),
  parsingStatus: artifactParsingStatusSchema,
  uploadedAt: z.string().datetime(),
});

export const applicationProfilesResponseSchema = z.object({
  persisted: z.boolean(),
  profiles: applicationProfilesSchema,
});

export const updateApplicationProfileInputSchema = z.object({
  profile: applicationProfileRecordSchema,
  schemaFamily: schemaFamilySchema,
});

export type SchemaFamilyDto = z.infer<typeof schemaFamilySchema>;
export type ResumeAssetReferenceDto = z.infer<typeof resumeAssetReferenceSchema>;
export type ApplicationProfilesDto = z.infer<typeof applicationProfilesSchema>;
export type ApplicationProfilesResponseDto = z.infer<typeof applicationProfilesResponseSchema>;
export type UpdateApplicationProfileInputDto = z.infer<
  typeof updateApplicationProfileInputSchema
>;

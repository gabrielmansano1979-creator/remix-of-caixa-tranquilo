/**
 * Stable import path for server-side NFS-e XML validation.
 * The implementation is kept in dps-xsd-validator.server.ts for compatibility
 * with the existing fiscal-emission code.
 */
export {
  assertDpsRequiredGroups,
  type DpsXsdValidationResult,
} from "./dps-xsd-validator.server";

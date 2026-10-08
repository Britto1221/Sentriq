import { z } from "zod";

export const ACTION_IDENTIFIERS = [
  "account.delete",
  "data.export",
  "admin.invite",
  "email.change",
  "session.revoke",
  "passkey.add",
  "passkey.remove",
  "security.settings.change",
] as const;

export const actionIdentifierSchema = z.enum(ACTION_IDENTIFIERS);
export type ActionIdentifier = z.infer<typeof actionIdentifierSchema>;

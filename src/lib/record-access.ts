import "server-only";

import { eq } from "drizzle-orm";

import { getDb, schema } from "@/db";
import {
  getAllowedClientIds,
  getAllowedEntityIds,
} from "./entity-access";
import {
  hasPermission,
  requirePermission,
  type Action,
} from "./permissions";
import type { AttachmentRecordType, SessionUser } from "./types";

export type AccessScope = {
  allowedClientIds: Set<string> | null;
  allowedEntityIds: Set<string> | null;
};

export class RecordAccessError extends Error {
  constructor(message = "You don't have access to that record.") {
    super(message);
    this.name = "RecordAccessError";
  }
}

export async function getAccessScope(user: SessionUser): Promise<AccessScope> {
  const [allowedClientIds, allowedEntityIds] = await Promise.all([
    getAllowedClientIds(user),
    getAllowedEntityIds(user),
  ]);
  return { allowedClientIds, allowedEntityIds };
}

export function isClientIdAllowed(
  scope: AccessScope,
  clientId: string | null | undefined,
  options: { allowUnscoped?: boolean } = {},
): boolean {
  if (scope.allowedClientIds === null) return true;
  if (!clientId) return options.allowUnscoped ?? false;
  return scope.allowedClientIds.has(clientId);
}

export function isEntityIdAllowed(
  scope: AccessScope,
  entityId: string | null | undefined,
  options: { allowUnscoped?: boolean } = {},
): boolean {
  if (scope.allowedEntityIds === null) return true;
  if (!entityId) return options.allowUnscoped ?? false;
  return scope.allowedEntityIds.has(entityId);
}

export function isScopedRecordAllowed(
  scope: AccessScope,
  record: {
    clientId?: string | null;
    customerId?: string | null;
    entityId?: string | null;
  },
): boolean {
  const clientId = record.clientId ?? record.customerId ?? null;
  const entityId = record.entityId ?? null;
  if (!clientId && !entityId) {
    return scope.allowedClientIds === null && scope.allowedEntityIds === null;
  }
  if (clientId && !isClientIdAllowed(scope, clientId)) return false;
  if (entityId && !isEntityIdAllowed(scope, entityId)) return false;
  return true;
}

function writeActionForRecordType(
  recordType: AttachmentRecordType,
): Action | null {
  switch (recordType) {
    case "journal_entry":
      return "journal_entry.update";
    case "invoice":
      return "invoice.update";
    case "bill":
      return "bill.update";
    case "bank_account":
      return "bank.create_transaction";
    case "contact":
    case "entity":
    case "asset":
    case "fee":
    case "time_entry":
    case "other":
      return "settings.write";
  }
}

export function canWriteAttachmentRecord(
  user: SessionUser,
  recordType: AttachmentRecordType,
): boolean {
  const action = writeActionForRecordType(recordType);
  return action ? hasPermission(user, action) : false;
}

export function requireWriteAttachmentRecord(
  user: SessionUser,
  recordType: AttachmentRecordType,
): void {
  const action = writeActionForRecordType(recordType);
  if (!action) throw new RecordAccessError("Unsupported attachment target.");
  requirePermission(user, action);
}

export async function canReadRecord(
  user: SessionUser | null | undefined,
  recordType: AttachmentRecordType,
  recordId: string,
): Promise<boolean> {
  if (!user || !recordId) return false;
  if (user.isSuperuser || user.role === "super_admin" || user.role === "admin") {
    return true;
  }

  const db = getDb();
  const scope = await getAccessScope(user);

  switch (recordType) {
    case "invoice": {
      const [row] = await db
        .select({
          customerId: schema.invoices.customerId,
          clientId: schema.invoices.clientId,
          entityId: schema.invoices.entityId,
        })
        .from(schema.invoices)
        .where(eq(schema.invoices.id, recordId))
        .limit(1);
      return row ? isScopedRecordAllowed(scope, row) : false;
    }
    case "bill": {
      const [row] = await db
        .select({
          clientId: schema.bills.clientId,
          entityId: schema.bills.entityId,
          chargebackClientId: schema.bills.chargebackClientId,
          chargebackEntityId: schema.bills.chargebackEntityId,
        })
        .from(schema.bills)
        .where(eq(schema.bills.id, recordId))
        .limit(1);
      if (!row) return false;
      return (
        isScopedRecordAllowed(scope, row) ||
        isScopedRecordAllowed(scope, {
          clientId: row.chargebackClientId,
          entityId: row.chargebackEntityId,
        })
      );
    }
    case "journal_entry": {
      const [row] = await db
        .select({ entityId: schema.journalEntries.entityId })
        .from(schema.journalEntries)
        .where(eq(schema.journalEntries.id, recordId))
        .limit(1);
      return row ? isEntityIdAllowed(scope, row.entityId, { allowUnscoped: true }) : false;
    }
    case "contact": {
      const [row] = await db
        .select({
          customerId: schema.contacts.customerId,
          userId: schema.contacts.userId,
        })
        .from(schema.contacts)
        .where(eq(schema.contacts.id, recordId))
        .limit(1);
      if (!row) return false;
      if (row.userId === user.userId) return true;
      return isClientIdAllowed(scope, row.customerId);
    }
    case "entity": {
      const [row] = await db
        .select({
          id: schema.entities.id,
          clientId: schema.entities.clientId,
        })
        .from(schema.entities)
        .where(eq(schema.entities.id, recordId))
        .limit(1);
      return row
        ? isEntityIdAllowed(scope, row.id) ||
            isClientIdAllowed(scope, row.clientId)
        : false;
    }
    case "asset": {
      const [row] = await db
        .select({
          clientId: schema.assets.clientId,
          entityId: schema.assets.entityId,
        })
        .from(schema.assets)
        .where(eq(schema.assets.id, recordId))
        .limit(1);
      return row ? isScopedRecordAllowed(scope, row) : false;
    }
    case "bank_account": {
      const [row] = await db
        .select({
          clientId: schema.bankAccounts.clientId,
          entityId: schema.bankAccounts.entityId,
        })
        .from(schema.bankAccounts)
        .where(eq(schema.bankAccounts.id, recordId))
        .limit(1);
      return row ? isScopedRecordAllowed(scope, row) : false;
    }
    case "fee": {
      const [row] = await db
        .select({ entityId: schema.entityFees.entityId })
        .from(schema.entityFees)
        .where(eq(schema.entityFees.id, recordId))
        .limit(1);
      return row ? isEntityIdAllowed(scope, row.entityId) : false;
    }
    case "time_entry": {
      const [row] = await db
        .select({
          userId: schema.timeEntries.userId,
          clientId: schema.timeEntries.clientId,
          entityId: schema.timeEntries.entityId,
        })
        .from(schema.timeEntries)
        .where(eq(schema.timeEntries.id, recordId))
        .limit(1);
      if (!row) return false;
      if (row.userId === user.userId) return true;
      return isScopedRecordAllowed(scope, row);
    }
    case "other":
      return hasPermission(user, "settings.write");
  }
}

export async function requireReadRecord(
  user: SessionUser | null | undefined,
  recordType: AttachmentRecordType,
  recordId: string,
): Promise<void> {
  if (!(await canReadRecord(user, recordType, recordId))) {
    throw new RecordAccessError();
  }
}

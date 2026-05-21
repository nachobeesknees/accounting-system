import "server-only";

export const USER_PASSWORD_FLASH_COOKIE = "wyzird_user_password_flash";

export type PasswordFlash = {
  kind: "created" | "reset";
  userId?: string;
  email?: string;
  tempPassword: string;
};

export function encodePasswordFlash(flash: PasswordFlash): string {
  return Buffer.from(JSON.stringify(flash), "utf8").toString("base64url");
}

export function decodePasswordFlash(
  value: string | undefined,
): PasswordFlash | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(
      Buffer.from(value, "base64url").toString("utf8"),
    ) as Partial<PasswordFlash>;
    if (
      (parsed.kind !== "created" && parsed.kind !== "reset") ||
      typeof parsed.tempPassword !== "string" ||
      parsed.tempPassword.length < 8
    ) {
      return null;
    }
    return {
      kind: parsed.kind,
      userId: typeof parsed.userId === "string" ? parsed.userId : undefined,
      email: typeof parsed.email === "string" ? parsed.email : undefined,
      tempPassword: parsed.tempPassword,
    };
  } catch {
    return null;
  }
}

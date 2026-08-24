export type AppRole =
  | "GUEST"
  | "USER"
  | "SUPPORT"
  | "CONTENT_MANAGER"
  | "ADMIN"
  | "SUPERADMIN";
export type AccessContext = {
  userId: string | null;
  role: AppRole;
  entitlements: ReadonlySet<string>;
};

export function hasEntitlement(context: AccessContext, entitlement: string) {
  return context.entitlements.has(entitlement);
}

export function canEditContent(context: AccessContext) {
  return ["CONTENT_MANAGER", "ADMIN", "SUPERADMIN"].includes(context.role);
}

export function canManageUsers(context: AccessContext) {
  return ["ADMIN", "SUPERADMIN"].includes(context.role);
}

export function canChangeRole(context: AccessContext, targetRole: AppRole) {
  if (targetRole === "SUPERADMIN") return context.role === "SUPERADMIN";
  return canManageUsers(context);
}

export function ownsResource(context: AccessContext, ownerId: string) {
  return context.userId !== null && context.userId === ownerId;
}

export function publicProgram<
  T extends {
    previousScores: unknown[];
    paidPlaces: unknown;
    tuition: unknown;
    dvi: unknown;
  },
>(program: T, fullData: boolean) {
  return fullData
    ? program
    : {
        ...program,
        previousScores: program.previousScores.slice(0, 1),
        paidPlaces: null,
        tuition: null,
        dvi: program.dvi ? "Доступно с Default" : null,
      };
}

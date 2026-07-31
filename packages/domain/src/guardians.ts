export interface GuardianNameParts {
  firstName: string;
  lastName: string;
}

export interface UnlinkGuardianDecision {
  allowed: boolean;
  reason?: string;
}

/**
 * Splits a single "guardian name" string into the two columns `Guardian` has.
 *
 * This exists because the old model stored one free-text name and the new one
 * stores a first and a last, so every migrated row and every create form has to
 * make this guess. It is a guess, and the function is honest about the rule it
 * uses: everything before the last space is the first name, the remainder is
 * the last name.
 *
 * That is wrong for "Maria de la Cruz" and it is wrong in the other direction
 * for cultures that write the family name first. Both are real, and neither is
 * fixable by a cleverer split — the information is genuinely not in the string.
 * What matters is that the failure is *visible and correctable*: the guardian
 * panel shows the two fields separately, so someone who knows the answer can
 * fix it. A single-name person gets an empty last name rather than a duplicated
 * one, because inventing "Cher Cher" is worse than leaving a blank a human can
 * see.
 */
export function splitGuardianName(fullName: string): GuardianNameParts {
  const trimmed = fullName.trim().replace(/\s+/g, " ");
  if (trimmed.length === 0) return { firstName: "", lastName: "" };

  const lastSpace = trimmed.lastIndexOf(" ");
  if (lastSpace === -1) return { firstName: trimmed, lastName: "" };

  return { firstName: trimmed.slice(0, lastSpace), lastName: trimmed.slice(lastSpace + 1) };
}

/**
 * Email is the identity of a guardian across the system, so it is compared
 * case-insensitively and without surrounding whitespace.
 *
 * Without this, "Denise.Johnson@guardian.example" typed into the student form
 * creates a second Guardian row for a person who already exists, and the two
 * records then drift — which is the entire class of problem this story exists
 * to remove.
 */
export function normalizeGuardianEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * A student must always have at least one guardian.
 *
 * The rule is not "unlinking is dangerous"; it is that a student with no
 * guardian has no one the school can contact, and every downstream feature —
 * the digest, the communication draft agent, the family portal — silently has
 * nothing to do rather than reporting a problem. Refusing the last unlink keeps
 * that invariant where it can be seen instead of discovering it later as an
 * absence.
 */
export function decideGuardianUnlink(input: { linkCount: number }): UnlinkGuardianDecision {
  if (input.linkCount <= 1) {
    return {
      allowed: false,
      reason: "This is the student's only guardian. Add another before removing this one."
    };
  }
  return { allowed: true };
}

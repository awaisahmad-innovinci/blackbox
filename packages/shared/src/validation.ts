export const PERSON_NAME_PATTERN = /^[A-Za-z]+(?: [A-Za-z]+)*$/;
export const USERNAME_PATTERN = /^[A-Za-z0-9!@#$%^&*()_+=.-]+$/;
export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const PHONE_11_DIGIT_PATTERN = /^[0-9]{11}$/;

export const PERSON_NAME_MESSAGE =
  "Name may only contain letters and spaces (no numbers or special characters)";
export const USERNAME_MESSAGE =
  "Username may contain letters, numbers, and special characters, without spaces";
export const EMAIL_MESSAGE = "Enter a valid email address";
export const PHONE_11_DIGIT_MESSAGE =
  "Phone number must be exactly 11 digits (e.g. 03049636186)";

export const USERNAME_MIN_LENGTH = 3;

export function personNameError(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return "Name is required";
  if (!PERSON_NAME_PATTERN.test(trimmed)) return PERSON_NAME_MESSAGE;
  return null;
}

export function usernameError(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return "Username is required";
  if (trimmed.length < USERNAME_MIN_LENGTH) {
    return `Username must be at least ${USERNAME_MIN_LENGTH} characters`;
  }
  if (!USERNAME_PATTERN.test(trimmed)) return USERNAME_MESSAGE;
  return null;
}

export function emailError(
  value: string,
  options?: { required?: boolean },
): string | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return options?.required === false ? null : "Email is required";
  }
  if (!EMAIL_PATTERN.test(trimmed)) return EMAIL_MESSAGE;
  return null;
}

export function phone11DigitError(
  value: string,
  options?: { required?: boolean },
): string | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return options?.required === false ? null : "Phone number is required";
  }
  if (!PHONE_11_DIGIT_PATTERN.test(trimmed)) return PHONE_11_DIGIT_MESSAGE;
  return null;
}

/** Allows a trailing space while typing a second word. */
const PERSON_NAME_TYPING_PATTERN = /^[A-Za-z]+(?: [A-Za-z]+)* ?$/;

/** Format errors while the user is typing; empty fields stay silent. */
export function livePersonNameError(value: string): string | null {
  if (!value.trim()) return null;
  if (!PERSON_NAME_TYPING_PATTERN.test(value)) return PERSON_NAME_MESSAGE;
  return null;
}

export function liveUsernameError(value: string): string | null {
  if (!value.trim()) return null;
  return usernameError(value);
}

export function liveEmailError(value: string): string | null {
  if (!value.trim()) return null;
  return emailError(value, { required: false });
}

export function livePhone11DigitError(value: string): string | null {
  if (!value.trim()) return null;
  return phone11DigitError(value, { required: false });
}

export function livePasswordError(value: string): string | null {
  if (!value) return null;
  if (value.length < 8) return "Password must be at least 8 characters";
  return null;
}

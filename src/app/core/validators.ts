import { AbstractControl, ValidationErrors, ValidatorFn } from '@angular/forms';

/** Стрічка приймає лише minAge >= 18, тож молодшим у застосунку робити нічого. */
export const adultValidator: ValidatorFn = (control: AbstractControl): ValidationErrors | null => {
  const value = control.value as string;
  if (!value) return null;

  const birth = new Date(value);
  if (Number.isNaN(birth.getTime())) return { invalidDate: true };

  const now = new Date();
  if (birth > now) return { future: true };

  const eighteenth = new Date(birth.getFullYear() + 18, birth.getMonth(), birth.getDate());
  return eighteenth <= now ? null : { underage: true };
};

export function passwordsMatch(passwordKey: string, confirmKey: string): ValidatorFn {
  return (group: AbstractControl): ValidationErrors | null => {
    const password = group.get(passwordKey)?.value;
    const confirm = group.get(confirmKey)?.value;

    if (!password || !confirm) return null;
    return password === confirm ? null : { passwordMismatch: true };
  };
}

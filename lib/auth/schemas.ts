import { z } from "zod";

const password = z
  .string()
  .min(12, "Минимум 12 символов")
  .max(128)
  .regex(/[a-zа-я]/u, "Добавьте строчную букву")
  .regex(/[A-ZА-Я]/u, "Добавьте заглавную букву")
  .regex(/\d/, "Добавьте цифру");

// Existing bcrypt hashes can belong to passwords created before the byte limit.
const newPassword = password.refine(
  (value) => new TextEncoder().encode(value).length <= 72,
  "Пароль должен занимать не более 72 байт",
);

export const credentialsSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  password,
});

export const registerSchema = credentialsSchema.extend({
  name: z.string().trim().min(2).max(80),
  password: newPassword,
});

export const emailSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
});

export const tokenSchema = z.object({ token: z.string().min(32).max(128) });

export const verifyEmailSchema = tokenSchema.extend({ password });

export const resetPasswordSchema = tokenSchema.extend({
  password: newPassword,
});

export const twoFactorSchema = z.object({
  challengeId: z.string().cuid(),
  code: z.string().regex(/^\d{6}$/),
});

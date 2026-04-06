/**
 * E-Mail-Service – Krug Fleet Manager
 * Credentials sind direkt im Code hinterlegt.
 * Kein localStorage, keine Umgebungsvariablen erforderlich.
 */

import emailjs from '@emailjs/browser';

// ─── Fest eingebettete Credentials ────────────────────────────────────────────
const EMAILJS_SERVICE_ID          = 'service_zw7ipvz';
const EMAILJS_TEMPLATE_ID         = 'template_axk3qqo';   // Willkommens-E-Mail
const EMAILJS_VEHICLE_TEMPLATE_ID = 'template_9mmuhji';   // Fahrzeug-E-Mail
const EMAILJS_PUBLIC_KEY          = 'sRxRtOE-mbVtrIfRT';

// EmailJS einmalig initialisieren
emailjs.init({ publicKey: EMAILJS_PUBLIC_KEY });

// ─── Typen ─────────────────────────────────────────────────────────────────────
export interface EmailSettings {
  serviceId:         string;
  templateId:        string;
  vehicleTemplateId: string;
  publicKey:         string;
  senderName:        string;
  appUrl:            string;
  mailDomain:        string;
}

export type SendResult =
  | { status: 'sent' }
  | { status: 'not_configured' }
  | { status: 'error'; message: string };

// ─── Einstellungen (immer die fest hinterlegten Werte) ─────────────────────────
export function loadEmailSettings(): EmailSettings {
  return {
    serviceId:         EMAILJS_SERVICE_ID,
    templateId:        EMAILJS_TEMPLATE_ID,
    vehicleTemplateId: EMAILJS_VEHICLE_TEMPLATE_ID,
    publicKey:         EMAILJS_PUBLIC_KEY,
    senderName:        'Krug Fleet Manager',
    appUrl:            window.location.origin,
    mailDomain:        'ksmeu.com',
  };
}

/** saveEmailSettings bleibt als No-Op erhalten, damit bestehende Aufrufe nicht brechen */
export function saveEmailSettings(_s: EmailSettings): void {
  // Credentials sind fest im Code – kein Speichern notwendig
}

/** syncEmailSettingsFromSupabase – No-Op, für API-Kompatibilität */
export async function syncEmailSettingsFromSupabase(): Promise<void> {
  // nicht benötigt
}

export function isEmailConfigured(): boolean {
  return true; // Credentials immer vorhanden
}

export function isVehicleMailConfigured(): boolean {
  return true; // Credentials immer vorhanden
}

// ─── Willkommens-E-Mail ────────────────────────────────────────────────────────
export interface WelcomeEmailParams {
  toEmail:  string;
  toName:   string;
  password: string;
  role:     string;
}

/**
 * Sendet eine Willkommens-E-Mail an einen neu angelegten Benutzer.
 *
 * Erforderliche Template-Variablen in EmailJS (template_axk3qqo):
 *   {{to_name}}, {{to_email}}, {{password}}, {{role}}, {{app_url}}, {{sender_name}}
 */
export async function sendWelcomeEmail(params: WelcomeEmailParams): Promise<SendResult> {
  try {
    await emailjs.send(EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID, {
      to_name:     params.toName,
      to_email:    params.toEmail,
      password:    params.password,
      role:        params.role,
      app_url:     window.location.origin,
      sender_name: 'Krug Fleet Manager',
    });
    return { status: 'sent' };
  } catch (err: unknown) {
    console.error('[emailService] sendWelcomeEmail:', err);
    return { status: 'error', message: err instanceof Error ? err.message : String(err) };
  }
}

// ─── Fahrzeug-E-Mail ───────────────────────────────────────────────────────────
export interface VehicleEmailParams {
  fromVin:   string;
  fromEmail: string;
  toEmail:   string;
  subject:   string;
  body:      string;
}

/**
 * Sendet eine Fahrzeug-E-Mail (VIN als Absender-Kontext).
 *
 * Erforderliche Template-Variablen in EmailJS (template_9mmuhji):
 *   {{from_email}}, {{from_name}}, {{to_email}}, {{subject}}, {{message}}, {{vin}}, {{sender_name}}, {{reply_to}}
 */
export async function sendVehicleEmail(params: VehicleEmailParams): Promise<SendResult> {
  try {
    await emailjs.send(EMAILJS_SERVICE_ID, EMAILJS_VEHICLE_TEMPLATE_ID, {
      from_email:  params.fromEmail,
      from_name:   `Krug Fleet Manager – FZG ${params.fromVin}`,
      to_email:    params.toEmail,
      subject:     params.subject,
      message:     params.body,
      vin:         params.fromVin,
      sender_name: 'Krug Fleet Manager',
      reply_to:    params.fromEmail,
    });
    return { status: 'sent' };
  } catch (err: unknown) {
    console.error('[emailService] sendVehicleEmail:', err);
    return { status: 'error', message: err instanceof Error ? err.message : String(err) };
  }
}

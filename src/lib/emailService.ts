/**
 * E-Mail-Service für den Krug Fleet Manager
 *
 * Zwei Use-Cases:
 *   1. Willkommens-E-Mail bei neuen Benutzern (templateId)
 *   2. Fahrzeug-E-Mails mit VIN-Absender (vehicleTemplateId)
 *
 * Konfiguration über Admin-Bereich → Einstellungen-Tab.
 *
 * Speicherung:
 *   - Wenn Supabase konfiguriert: Einstellungen zusätzlich in store_state (Supabase)
 *   - Immer auch: localStorage (synchrone Kompatibilität mit bestehender UI)
 */

import emailjs from '@emailjs/browser';
import { supabase, isSupabaseConfigured } from './supabaseClient';

// ─── Konfiguration ─────────────────────────────────────────────────────────

const SETTINGS_KEY = 'fleet-email-settings';

export interface EmailSettings {
  serviceId:         string;
  templateId:        string;        // für Willkommens-E-Mails
  vehicleTemplateId: string;        // für Fahrzeug-E-Mails
  publicKey:         string;
  senderName:        string;
  appUrl:            string;
  mailDomain:        string;        // Domain für VIN-Adressen, z. B. ksmeu.com
}

function _parseSettings(raw: string | null): EmailSettings | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<EmailSettings>;
    return {
      serviceId:         parsed.serviceId         ?? '',
      templateId:        parsed.templateId        ?? '',
      vehicleTemplateId: parsed.vehicleTemplateId ?? '',
      publicKey:         parsed.publicKey         ?? '',
      senderName:        parsed.senderName        ?? 'Krug Fleet Manager',
      appUrl:            parsed.appUrl            ?? window.location.origin,
      mailDomain:        parsed.mailDomain        ?? 'ksmeu.com',
    };
  } catch { return null; }
}

function _defaultSettings(): EmailSettings {
  return {
    serviceId:         (import.meta.env.VITE_EMAILJS_SERVICE_ID          as string) ?? '',
    templateId:        (import.meta.env.VITE_EMAILJS_TEMPLATE_ID         as string) ?? '',
    vehicleTemplateId: (import.meta.env.VITE_EMAILJS_VEHICLE_TEMPLATE_ID as string) ?? '',
    publicKey:         (import.meta.env.VITE_EMAILJS_PUBLIC_KEY          as string) ?? '',
    senderName:        'Krug Fleet Manager',
    appUrl:            window.location.origin,
    mailDomain:        'ksmeu.com',
  };
}

/** Synchrones Laden aus localStorage (unveränderte API) */
export function loadEmailSettings(): EmailSettings {
  const raw = localStorage.getItem(SETTINGS_KEY);
  return _parseSettings(raw) ?? _defaultSettings();
}

/** Speichert in localStorage UND async in Supabase */
export function saveEmailSettings(s: EmailSettings): void {
  const value = JSON.stringify(s);
  localStorage.setItem(SETTINGS_KEY, value);
  if (isSupabaseConfigured && supabase) {
    supabase
      .from('store_state')
      .upsert({ key: SETTINGS_KEY, value, updated_at: new Date().toISOString() }, { onConflict: 'key' })
      .then(({ error }) => {
        if (error) console.warn('[emailService] Supabase save:', error.message);
      });
  }
}

/** Async: Supabase → localStorage synchronisieren (beim App-Start aufgerufen) */
export async function syncEmailSettingsFromSupabase(): Promise<void> {
  if (!isSupabaseConfigured || !supabase) return;
  try {
    const { data } = await supabase
      .from('store_state')
      .select('value')
      .eq('key', SETTINGS_KEY)
      .maybeSingle();
    if (data?.value) {
      localStorage.setItem(SETTINGS_KEY, data.value as string);
    }
  } catch { /* ignorieren */ }
}

export function isEmailConfigured(): boolean {
  const s = loadEmailSettings();
  return Boolean(s.serviceId && s.templateId && s.publicKey);
}

export function isVehicleMailConfigured(): boolean {
  const s = loadEmailSettings();
  return Boolean(s.serviceId && s.vehicleTemplateId && s.publicKey);
}

// ─── Typen ─────────────────────────────────────────────────────────────────

export type SendResult =
  | { status: 'sent' }
  | { status: 'not_configured' }
  | { status: 'error'; message: string };

// ─── Willkommens-E-Mail ────────────────────────────────────────────────────

export interface WelcomeEmailParams {
  toEmail:  string;
  toName:   string;
  password: string;
  role:     string;
}

/**
 * Template-Variablen (im EmailJS-Template erforderlich):
 *   {{to_name}}, {{to_email}}, {{password}}, {{role}}, {{app_url}}, {{sender_name}}
 */
export async function sendWelcomeEmail(params: WelcomeEmailParams): Promise<SendResult> {
  const s = loadEmailSettings();
  if (!s.serviceId || !s.templateId || !s.publicKey) return { status: 'not_configured' };

  try {
    emailjs.init({ publicKey: s.publicKey });
    await emailjs.send(s.serviceId, s.templateId, {
      to_name:     params.toName,
      to_email:    params.toEmail,
      password:    params.password,
      role:        params.role,
      app_url:     s.appUrl || window.location.origin,
      sender_name: s.senderName || 'Krug Fleet Manager',
    });
    return { status: 'sent' };
  } catch (err: unknown) {
    return { status: 'error', message: err instanceof Error ? err.message : String(err) };
  }
}

// ─── Fahrzeug-E-Mail ───────────────────────────────────────────────────────

export interface VehicleEmailParams {
  fromVin:   string;
  fromEmail: string;
  toEmail:   string;
  subject:   string;
  body:      string;
}

/**
 * Template-Variablen für das Fahrzeug-Template:
 *   {{from_email}}, {{from_name}}, {{to_email}}, {{subject}}, {{message}}, {{vin}}, {{sender_name}}
 *
 * Wichtig: Im EmailJS-Template muss "Reply-To" auf {{from_email}} gesetzt sein.
 */
export async function sendVehicleEmail(params: VehicleEmailParams): Promise<SendResult> {
  const s = loadEmailSettings();
  if (!s.serviceId || !s.vehicleTemplateId || !s.publicKey) return { status: 'not_configured' };

  try {
    emailjs.init({ publicKey: s.publicKey });
    await emailjs.send(s.serviceId, s.vehicleTemplateId, {
      from_email:  params.fromEmail,
      from_name:   `${s.senderName || 'Krug Fleet Manager'} – FZG ${params.fromVin}`,
      to_email:    params.toEmail,
      subject:     params.subject,
      message:     params.body,
      vin:         params.fromVin,
      sender_name: s.senderName || 'Krug Fleet Manager',
      reply_to:    params.fromEmail,
    });
    return { status: 'sent' };
  } catch (err: unknown) {
    return { status: 'error', message: err instanceof Error ? err.message : String(err) };
  }
}
